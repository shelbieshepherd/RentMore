/**
 * TEMPORARY one-shot diagnostic (DO NOT keep in production).
 *
 * Reads live Stripe objects for a SINGLE hardcoded target session + connected
 * account using the LIVE platform secret key (which only exists in the Vercel
 * runtime env). Returns summary-only fields (no secrets, no raw objects).
 * Wired into vercel-entry.ts / serve.ts at /api/stripe/diag.
 *
 * Purpose: decide the three-way split for the recurring "collected card never
 * saves" bug on BK-MT1IL9B8:
 *   (A) card saved on Stripe but webhook not delivering (subscription/secret/delivery),
 *   (B) card never saved on Stripe (SetupIntent not succeeded),
 *   (C) card saved AND webhook delivered but handler failed to persist (code bug).
 *
 * Remove this file + its wiring after the diagnostic is captured.
 */

const TARGET_SESSION = "cs_live_c1asYO5KAnLGKlrUTEmSuOMUZFrVyQYQKSlBDavkVtmFGqCPihaiprOmwv";
const TARGET_ACCT = "acct_1U4302PVgmdzYglg"; // Nic Shepherd (connected account)

async function getStripe() {
  const { stripe } = await import("~/lib/stripe");
  return stripe();
}

const sumSess = (s: any) => ({
  id: s?.id,
  status: s?.status,
  mode: s?.mode,
  setup_intent: s?.setup_intent ?? null,
  customer: s?.customer ?? null,
  customer_email: s?.customer_details?.email ?? null,
  payment_status: s?.payment_status,
  metadata: s?.metadata ?? null,
  created: s?.created ? new Date(s.created * 1000).toISOString() : null,
});

const sumSi = (si: any) => ({
  id: si?.id,
  status: si?.status,
  payment_method: si?.payment_method ?? null,
  on_behalf_of: si?.on_behalf_of ?? si?.account ?? null,
  metadata: si?.metadata ?? null,
  created: si?.created ? new Date(si.created * 1000).toISOString() : null,
});

const sumPm = (pm: any) => {
  if (!pm) return null;
  const card = pm.card as any;
  const bank = pm.us_bank_account as any;
  return {
    id: pm.id,
    type: pm.type,
    ...(card
      ? { brand: card.brand, last4: card.last4, exp: `${String(card.exp_month).padStart(2, "0")}/${String(card.exp_year).slice(-2)}` }
      : {}),
    ...(bank ? { bank: bank.bank_name, last4: bank.last4 } : {}),
  };
};

export async function handleStripeDiagnostic(): Promise<
  { ok: true; data: unknown } | { ok: false; error: string }
> {
  const st = await getStripe();
  const out: Record<string, unknown> = { target_session: TARGET_SESSION, target_acct: TARGET_ACCT };

  // 1) Checkout.Session (what the owner used)
  try {
    const s = await st.checkout.sessions.retrieve(TARGET_SESSION);
    out.session = sumSess(s);
  } catch (e: any) {
    out.session = { error: e?.message ?? "retrieve failed" };
  }

  // 2) The SetupIntent linked to the session, on the CONNECTED account
  const se = (out.session as any)?.setup_intent;
  if (typeof se === "string") {
    try {
      const si = await st.setupIntents.retrieve(se, {
        stripeAccount: TARGET_ACCT,
        expand: ["payment_method"],
      });
      const anySi = si as any;
      out.setup_intent = sumSi(si);
      out.setup_intent_payment_method = sumPm(anySi?.payment_method ?? null);
      // Re-read full exit status from the typed object too
      out.setup_intent_has_pm = !!anySi?.payment_method;
    } catch (e: any) {
      out.setup_intent = { error: e?.message ?? "retrieve failed" };
    }
  }

  // 3) Recent SetupIntents on the connected account (any succeeded?)
  try {
    const list = await st.setupIntents.list({ limit: 10 }, { stripeAccount: TARGET_ACCT });
    out.recent_setup_intents = list.data.map(sumSi);
    out.recent_status_counts = list.data.reduce((acc: Record<string, number>, si) => {
      acc[si.status] = (acc[si.status] ?? 0) + 1;
      return acc;
    }, {});
    const succeeded = list.data.find((si) => si.status === "succeeded");
    out.any_succeeded = succeeded
      ? { id: succeeded.id, created: new Date(succeeded.created * 1000).toISOString() }
      : null;
  } catch (e: any) {
    out.recent_setup_intents = { error: e?.message ?? "list failed" };
  }

  // 4) Platform webhook endpoints + enabled setup/account events
  try {
    const eps = await st.webhookEndpoints.list({ limit: 10 });
    const relevant: unknown[] = [];
    for (const ep of eps.data) {
      const ev = (ep.enabled_events as string[]) ?? [];
      const subs = ev.filter((x) => x.includes("setup") || x.includes("account") || x === "*");
      relevant.push({ id: ep.id, url: ep.url, status: ep.status, setup_and_account_events: subs });
    }
    out.webhook_endpoints = relevant;
  } catch (e: any) {
    out.webhook_endpoints = { error: e?.message ?? "list failed" };
  }

  // 5) Recent setup_intent.* events on the platform (were they even CREATED?)
  try {
    const evs = await st.events.list({ limit: 25, type: "setup_intent.succeeded" } as any);
    out.setup_intent_succeeded_events = evs.data.map((ev) => ({
      id: ev.id,
      created: new Date(ev.created * 1000).toISOString(),
      api_version: ev.api_version,
      acct: (ev as any).account ?? (ev.data?.object as any)?.account ?? null,
      object: (ev.data?.object as any)?.id,
      status: (ev.data?.object as any)?.status,
    }));
    out.setup_intent_succeeded_count = evs.data.length;
  } catch (e: any) {
    out.setup_intent_succeeded_events = { error: e?.message ?? "events list failed" };
  }

  // 6) Verdict
  const anySucceeded = (out.any_succeeded as any) != null;
  const sessionHasSi = typeof se === "string";
  out.verdict = anySucceeded
    ? "CARD SAVED ON STRIPE → mode A or C (webhook not delivering, or handler failed to persist). Check webhook_endpoints subscription + our DB."
    : sessionHasSi
      ? "NO succeeded SetupIntent on the connected account → mode B (card never saved on Stripe); owner card entry failed/declined, or account not live card-enabled."
      : "Session has no SetupIntent → cannot confirm a save happened; mode B most likely (card never successfully saved).";

  return { ok: true, data: out };
}

/** One-shot gate: the caller must echo the exact target session + account ids. */
export const diagnosticRequestAllowed = (body: string): boolean => {
  try {
    const j = JSON.parse(body || "{}");
    return j?.session === TARGET_SESSION && j?.acct === TARGET_ACCT;
  } catch {
    return false;
  }
};
