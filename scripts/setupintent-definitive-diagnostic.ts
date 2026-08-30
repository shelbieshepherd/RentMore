/**
 * setupintent-definitive-diagnostic.ts
 *
 * DEFINITIVE Stripe API diagnostic for the recurring "collected card never
 * saves" bug on booking BK-MT1IL9B8 (id 11e968fc-036b-42b7-90c8-ef92cd0b618a).
 *
 * PURPOSE
 *   Decide between the two mutually-exclusive failure modes that both leave
 *   ZERO payment_methods rows in our DB:
 *
 *   (A) WEBHOOK-DELIVERY FAILURE (our side): the card WAS saved on Stripe's
 *       side (a SetupIntent reached `succeeded` and a PaymentMethod exists on
 *       the connected account), but the platform's "Connected accounts"
 *       webhook endpoint is NOT subscribed to `setup_intent.succeeded`, so the
 *       event never reaches our handler (collect-card-architecture-rootcause.md).
 *
 *   (B) UPSTREAM / CARD-NEVER-SAVED: the SetupIntent never reached `succeeded`
 *       on Stripe (connected account not live-enabled for card saving, or a
 *       test card number on a live account, etc.), so there is no event to
 *       deliver at all (collect-setupintent-upstream-rootcause.md).
 *
 *   The script fetches the GROUND TRUTH directly from Stripe for the exact
 *   Checkout Session the owner used, plus the connected account's recent
 *   SetupIntents and the Connected-accounts endpoint's enabled events.
 *
 * HOW TO RUN (owner/lead — the ONLY Stripe key that works is the LIVE PLATFORM
 *   secret key, i.e. the sk_live_ configured in Vercel for the RentMore Connect
 *   platform; the machine's shared test key is expired and on the old sandbox):
 *
 *   STRIPE_LIVE_SECRET_KEY=sk_live_... bun run scripts/setupintent-definitive-diagnostic.ts
 *
 *   or, as a one-liner in the Vercel/owner shell:
 *   STRIPE_LIVE_SECRET_KEY=... SK=... bunx tsx scripts/setupintent-definitive-diagnostic.ts
 *
 * No code change is required to run this; it only READS Stripe.
 */
import { neon } from "@neondatabase/serverless";

const KEY = process.env.STRIPE_LIVE_SECRET_KEY;
const ACCT = "acct_1U4302PVgmdzYglg"; // Nic Shepherd (connected account)
const SESSION = "cs_live_c1asYO5KAnLGKlrUTEmSuOMUZFrVyQYQKSlBDavkVtmFGqCPihaiprOmwv"; // owner-used session
const BOOKING_ID = "11e968fc-036b-42b7-90c8-ef92cd0b618a";

if (!KEY) {
  console.error("Set STRIPE_LIVE_SECRET_KEY (the sk_live_ from Vercel) — the shared test key is expired/on the old sandbox and cannot see live objects.");
  process.exit(1);
}

const s = (path: string, params = "") =>
  fetch(`https://api.stripe.com/v1/${path}${params}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  }).then(async (r) => ({ status: r.status, json: await r.json() }));

function summarizeSetupIntent(si: any) {
  return {
    id: si?.id,
    status: si?.status,
    payment_method: si?.payment_method ?? null,
    on_behalf_of: si?.on_behalf_of ?? si?.account ?? null,
    metadata: si?.metadata ?? null,
    created: si?.created ? new Date(si.created * 1000).toISOString() : null,
  };
}

async function main() {
  console.log("\n========== DEFINITIVE STRIPE DIAGNOSTIC ==========");
  console.log(`Session:   ${SESSION}`);
  console.log(`Connected: ${ACCT}`);
  console.log(`Booking:   ${BOOKING_ID}`);
  console.log("Using LIVE platform secret key (sk_live_...).\n");

  // 0) Local DB: current payment_methods state for the booking
  try {
    const url = process.env.DATABASE_URL!;
    const sql = neon(url.replace(/^"(.*)"$/, "$1"));
    const rows = await sql`SELECT id, booking_id, method_type, label, card_last4, stripe_pm_id, created_at
      FROM payment_methods WHERE booking_id=${BOOKING_ID}::uuid ORDER BY created_at DESC`;
    console.log(`[DB] payment_methods rows for booking: ${rows.length}`);
    if (rows.length) console.log(JSON.stringify(rows, null, 2));
  } catch (e: any) {
    console.warn(`[DB] could not read payment_methods (${e?.message})`);
  }

  // 1) Retrieve the owner-used Checkout Session
  const cs = await s(`checkout/sessions/${SESSION}`);
  console.log("\n[1] checkout.sessions.retrieve", cs.status === 200 ? "OK" : `HTTP ${cs.status}`, cs.json?.error?.message ?? "");
  const sess = cs.json;
  console.log("    session.status      :", sess?.status);
  console.log("    mode                :", sess?.mode);
  console.log("    setup_intent        :", sess?.setup_intent ?? "(none)");
  console.log("    payment_status      :", sess?.payment_status);
  console.log("    on_behalf_of        :", sess?.on_behalf_of ?? sess?.metadata?.account ?? null);
  console.log("    cus_/customer       :", sess?.customer ?? null);

  // 2) The SetupIntent linked to the session, in the CONNECTED account's context
  if (typeof sess?.setup_intent === "string") {
    const si = await s(`setup_intents/${sess.setup_intent}`, `?expand[]=payment_method`);
    console.log("\n[2] setup_intents.retrieve (connected context)", si.status);
    const obj = si.json;
    const pm = obj?.payment_method;
    console.log("    status      :", obj?.status);
    console.log("    pm id       :", pm?.id ?? obj?.payment_method ?? "(none)");
    console.log("    pm card/bank:", pm?.card ? `card ...${pm.card.last4}` : pm?.us_bank_account ? `bank ...${pm.us_bank_account.last4}` : "(n/a)");
    console.log("    on_behalf_of:", obj?.on_behalf_of ?? obj?.account ?? null);
    console.log("    metadata    :", JSON.stringify(obj?.metadata ?? null));
  } else {
    console.log("\n[2] Session has NO setup_intent string — the setup never produced a SetupIntent (session likely expired/abandoned or checkout.open).");
  }

  // 3) Connected account: recent SetupIntents (did ANY succeed?)
  const sis = await s("setup_intents", `?limit=10&expand[]=data.payment_method`);
  console.log("\n[3] connected account setup_intents (limit 10):", sis.status);
  const list = sis.json?.data ?? [];
  console.log("    count:", list.length);
  for (const si of list) {
    const pm = si.payment_method;
    console.log("   -", summarizeSetupIntent(si),
      pm?.card ? `card..${pm.card.last4}` : pm?.us_bank_account ? `bank..${pm.us_bank_account.last4}` : "");
  }

  // 4) Connected account: card PaymentMethods on file
  const pms = await s("payment_methods", `?type=card&limit=10`, );
  // NOTE: payment_methods list needs Stripe-Account or on_behalf_of against the connected account;
  const pms2 = await s("payment_methods", "");
  console.log("\n[4] platform payment_methods (type=card, top-level):", pms.status, "count", (pms.json?.data ?? []).length);
  console.log("    connected-account-scoped list would use GET /v1/customers/:id/payment_methods or the dashboard; see report.");

  // 5) Platform webhook endpoints + enabled_events (setup_intent.succeeded subscription check)
  const wh = await s("webhook_endpoints", "?limit=10");
  console.log("\n[5] webhook_endpoints.list:", wh.status);
  for (const ep of (wh.json?.data ?? [])) {
    console.log("   -", ep.id, "|", ep.url, "| events:", JSON.stringify((ep?.enabled_events ?? []).filter((e: string) => e.includes("setup") || e.includes("account") || e === "*")));
  }

  // 6) Verdict logic
  console.log("\n========== VERDICT ==========");
  if (cs.status === 404) {
    console.log("Session not found by this key. If this is the owner's live session, the key is NOT the live platform key (or session expired+purged). Re-check key source.");
    return;
  }
  const siOk = typeof sess?.setup_intent === "string";
  const sList = (sis.json?.data ?? []) as any[];
  const succeeded = sList.find((x: any) => x.status === "succeeded");
  console.log(`- Checkpoint 1 (session has setup_intent): ${siOk ? "YES" : "NO"}`);
  console.log(`- Checkpoint 2 (any setup_intent.status==succeeded on connected acct): ${succeeded ? "YES (" + succeeded.id + ")" : "NO"}`);
  if (succeeded) {
    console.log("  ⇒ CARD SAVED ON STRIPE. The failure is a WEBHOOK-DELIVERY gap (mode A):");
    console.log("    ensure the Connected-accounts endpoint is subscribed to `setup_intent.succeeded` (see [5])");
    console.log("    and that STRIPE_CONNECT_WEBHOOK_SECRET set in Vercel is that endpoint's CURRENT signing secret.");
  } else if (siOk && cs.json?.status === "complete") {
    console.log("  ⇒ Session complete but no succeeded SetupIntent found — inspect [2] status directly; likely requires_payment_method/processing = card not actually finalized.");
  } else {
    console.log("  ⇒ NO succeeded SetupIntent on the connected account. The card did NOT save on Stripe (mode B / upstream):");
    console.log("    connected account is not live-enabled for card saving, or a test card was used on a live account.");
  }
  console.log("===================================================================");
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
