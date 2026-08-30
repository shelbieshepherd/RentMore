// TEMPORARY gated mint helper for the live collect-card smoke test (2026-08-27).
// Replicates createSetupCheckout EXACTLY so the fresh link is created the same
// way the shipped app does (connected-account Customer + customer: on the setup
// session). Runs on the live host with the live platform key. Gated by a token
// + exact booking/company ids. REMOVE THIS FILE AND ITS WIRING AFTER THE SMOKE TEST.
import { sql } from "../db";
const GATE = "smoke_HcCffthzpETnWbGArkVgrcjI";
const EXPECT_BOOKING = "11e968fc-036b-42b7-90c8-ef92cd0b618a";
const EXPECT_COMPANY = "7e37203a-6c46-4e39-8be8-c3116a798574";
const SITE_BASE = "https://www.rentmorevrs.com";

export async function handleMint(bodyText: string): Promise<Response> {
  let body: any;
  try { body = JSON.parse(bodyText); } catch { return json({ error: "bad body" }, 400); }
  if (body.token !== GATE) return json({ error: "forbidden" }, 403);
  if (body.companyId !== EXPECT_COMPANY || body.bookingId !== EXPECT_BOOKING) {
    return json({ error: "wrong target" }, 403);
  }
  const method = body.method === "ach" ? "ach" : "card";
  const { bookingId, companyId } = body;
  const { stripe } = await import("./stripe");
  const companyRows = await sql()`
    SELECT stripe_connect_account_id, stripe_connect_onboarding_complete
    FROM companies WHERE id = ${companyId}::uuid LIMIT 1`;
  const company = companyRows[0];
  if (!company || !company.stripe_connect_account_id || !company.stripe_connect_onboarding_complete) {
    return json({ error: "connect not enabled" }, 400);
  }
  const meta: Record<string, string> = {
    company_id: companyId,
    method,
    mode: "ondemand-save",
    booking_id: bookingId,
  };
  if (body.propertyId) meta.property_id = body.propertyId;
  const returnBase = `${SITE_BASE}/guest/${encodeURIComponent(bookingId)}`;
  const acctId = company.stripe_connect_account_id;
  const email = (body.guestEmail as string | undefined)?.trim() || undefined;
  let customerId: string | undefined;
  if (email) {
    const existing = await stripe().customers.list({ email, limit: 1 }, { stripeAccount: acctId });
    customerId = existing.data[0]?.id;
  }
  if (!customerId) {
    const cust = await stripe().customers.create(
      { ...(email ? { email } : {}), metadata: { company_id: companyId } },
      { stripeAccount: acctId },
    );
    customerId = cust.id;
  }
  const session = await stripe().checkout.sessions.create({
    mode: "setup",
    ...(customerId ? { customer: customerId } : { customer_email: email || undefined }),
    payment_method_types: method === "ach" ? ["us_bank_account"] : ["card"],
    metadata: meta,
    payment_method_data: { allow_redisplay: "always" },
    // metadata here is required: in setup mode Stripe only copies
    // setup_intent_data.metadata onto the SetupIntent, which the webhook reads.
    setup_intent_data: { metadata: meta },
    success_url: `${returnBase}?ondemand=method-saved`,
    cancel_url: `${returnBase}?ondemand=cancelled`,
    },
    // The connected-account Customer only exists on the connected account, so
    // the setup session itself must run ON that account (stripeAccount header)
    // or Stripe returns "No such customer". (2026-08-27 smoke-test fix.)
    { stripeAccount: acctId },
    );
  return json({ url: session.url, setupIntentId: session.id, customerId, acctId, mock: false });
}

function json(o: unknown, status = 200): Response {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// TEMP webhook/persistence diagnostic (remove with the mint helper after smoke test)
export async function handleDiag(bodyText: string): Promise<Response> {
  let body: any;
  try { body = JSON.parse(bodyText); } catch { return json({ error: "bad body" }, 400); }
  if (body.token !== GATE) return json({ error: "forbidden" }, 403);
  if (body.chargeOnDemand) {
    // TEMP verification (task f3ed6230): replicate createOnDemandCharge's live
    // path against the real connected account + saved PM to confirm the
    // PaymentIntent succeeds off-session. Small amount. MethodId is pinned.
    try {
      const METHOD_ID = "6429b148-a574-42ae-8951-bedd85fb4c05";
      const AMOUNT_CENTS = 100; // $1.00 PM-net base
      const { stripe } = await import("./stripe");
      const { guestTotalCents, pmNetCents, stripeFeeCents } = await import("./fees");
      const pms = await sql()`SELECT id, company_id, booking_id, property_id, method_type, stripe_pm_id, stripe_customer_id FROM payment_methods WHERE id = ${METHOD_ID}::uuid`;
      const pm = pms[0];
      if (!pm) return json({ chargeOnDemand: "ERROR", detail: "payment method not found" }, 500);
      const method = pm.method_type === "ach" ? "ACH" : "credit card";
      const guestTotal = guestTotalCents(AMOUNT_CENTS, method);
      const pmNet = pmNetCents(AMOUNT_CENTS, method);
      const company = (await sql()`SELECT stripe_connect_account_id FROM companies WHERE id = ${pm.company_id}::uuid`)[0];
      const acctId = company.stripe_connect_account_id;
      const meta: Record<string, string> = {
        company_id: pm.company_id,
        payment_type: "charge",
        method: pm.method_type === "ach" ? "ach" : "card",
        booking_amount_cents: String(AMOUNT_CENTS),
        pm_net_cents: String(pmNet),
        booking_id: pm.booking_id,
        property_id: pm.property_id,
      };
      const pi = await stripe().paymentIntents.create({
        amount: guestTotal,
        currency: "usd",
        payment_method: pm.stripe_pm_id,
        customer: pm.stripe_customer_id || undefined,
        payment_method_types: ["card"],
        confirm: true,
        off_session: true,
        on_behalf_of: acctId,
        description: "On-demand card charge — smoke test",
        metadata: meta,
      }, { stripeAccount: acctId });
      // Record ledger row (webhook reconciles idempotently), same as createOnDemandCharge.
      await sql()`
        INSERT INTO payments (company_id, booking_id, property_id, payment_type, method,
          amount_cents, description, status, stripe_payment_intent_id, processing_fee_cents)
        VALUES (${pm.company_id}::uuid, ${pm.booking_id}::uuid, ${pm.property_id}::uuid, 'charge', 'credit_card',
          ${pmNet}, 'On-demand card charge — smoke test', 'completed', ${pi.id}, ${stripeFeeCents(guestTotal, method)})
        ON CONFLICT (stripe_payment_intent_id) DO NOTHING`;
      return json({
        chargeOnDemand: "OK",
        paymentIntent: pi.id,
        status: pi.status,
        amount: guestTotal,
        currency: pi.currency,
        acct: acctId,
        pmId: pm.stripe_pm_id,
        customer: pm.stripe_customer_id,
      });
    } catch (e: any) {
      return json({ chargeOnDemand: "ERROR", detail: String(e?.message || e) }, 500);
    }
  }
  const { stripe } = await import("./stripe");
  const out: Record<string, any> = {
    env: {
      STRIPE_WEBHOOK_SECRET_tail: process.env.STRIPE_WEBHOOK_SECRET ? "...".concat(process.env.STRIPE_WEBHOOK_SECRET.slice(-6)) : null,
      STRIPE_CONNECT_WEBHOOK_SECRET_tail: process.env.STRIPE_CONNECT_WEBHOOK_SECRET ? "...".concat(process.env.STRIPE_CONNECT_WEBHOOK_SECRET.slice(-6)) : null,
    },
  };
  try {
    const eps = await stripe().webhookEndpoints.list({ limit: 100 });
    out.webhookEndpoints = eps.data.map((e) => ({
      id: e.id, status: e.status, url: e.url,
      connect: (e as any).connect ?? "n/a",
      application: (e as any).application ?? null,
      subscribed: Array.isArray(e.enabled_events) ? e.enabled_events : ["*"],
      hasSetupSub: Array.isArray(e.enabled_events)
        ? e.enabled_events.includes("setup_intent.succeeded") || e.enabled_events.includes("*")
        : true,
    }));
  } catch (e: any) { out.webhookEndpoints_error = e?.message; }
  // Raw retrieve of the platform webhook endpoint to expose `connect` + full object.
  try {
    const raw = await stripe().webhookEndpoints.retrieve("we_1U3jdSB9TYS1PBGTSpEmG5df");
    out.platformEndpointRaw = JSON.parse(JSON.stringify(raw));
  } catch (e: any) { out.platformEndpointRaw_error = e?.message; }
  try {
    const events = await stripe().events.list({
      type: "setup_intent.succeeded",
      created: { gte: Math.floor(Date.now() / 1000) - 4 * 3600 },
      limit: 20,
    });
    out.recentSetupEvents = events.data.map((ev) => ({
      id: ev.id, created: new Date(ev.created * 1000).toISOString(),
      account: (ev.data?.object as any)?.account ?? null,
      setupIntentId: (ev.data?.object as any)?.id ?? null,
      customer: (ev.data?.object as any)?.customer ?? null,
      metadata: (ev.data?.object as any)?.metadata ?? null,
      live: ev.livemode,
    }));
  } catch (e: any) { out.recentSetupEvents_error = e?.message; }

  // Connected-account context: events live on the connected account, not platform.
  const ACCT = "acct_1U4302PVgmdzYglg";
  try {
    const cEvents = await stripe().events.list({
      type: "setup_intent.succeeded",
      created: { gte: Math.floor(Date.now() / 1000) - 6 * 3600 },
      limit: 20,
    }, { stripeAccount: ACCT });
    out.connectedSetupEvents = cEvents.data.map((ev) => ({
      id: ev.id, created: new Date(ev.created * 1000).toISOString(),
      setupIntentId: (ev.data?.object as any)?.id ?? null,
      customer: (ev.data?.object as any)?.customer ?? null,
      metadata: (ev.data?.object as any)?.metadata ?? null,
      livemode: ev.livemode,
    }));
  } catch (e: any) { out.connectedSetupEvents_error = e?.message; }
  try {
    const acctEps = await stripe().webhookEndpoints.list({ limit: 20 }, { stripeAccount: ACCT });
    out.connectedWebhookEndpoints = acctEps.data.map((e) => ({
      id: e.id, status: e.status, url: e.url,
      subscribed: Array.isArray(e.enabled_events) ? e.enabled_events : ["*"],
    }));
  } catch (e: any) { out.connectedWebhookEndpoints_error = e?.message; }
  try {
    const sis = await stripe().setupIntents.list({
      limit: 20,
      created: { gte: Math.floor(Date.now() / 1000) - 6 * 3600 },
    }, { stripeAccount: ACCT });
    out.connectedRecentSetupIntents = sis.data.map((s) => ({
      id: s.id, status: s.status,
      customer: s.customer, payment_method: s.payment_method,
      metadata: s.metadata,
      created: new Date(s.created * 1000).toISOString(),
    }));
  } catch (e: any) { out.connectedSetupIntents_error = e?.message; }
  return json(out);
}
