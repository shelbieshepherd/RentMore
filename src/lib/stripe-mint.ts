// TEMPORARY gated mint helper for the live collect-card smoke test (2026-08-27).
// Replicates createSetupCheckout EXACTLY so the fresh link is created the same
// way the shipped app does (connected-account Customer + customer: on the setup
// session). Runs on the live host with the live platform key. Gated by a token
// + exact booking/company ids. REMOVE THIS FILE AND ITS WIRING AFTER THE SMOKE TEST.
import { sql } from "../src/db";
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
  const returnBase = `${SITE_BASE}/bookings/${encodeURIComponent(bookingId)}`;
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
    setup_intent_data: { on_behalf_of: acctId, metadata: meta },
    success_url: `${returnBase}?ondemand=method-saved`,
    cancel_url: `${returnBase}?ondemand=cancelled`,
  });
  return json({ url: session.url, setupIntentId: session.id, customerId, acctId, mock: false });
}

function json(o: unknown, status = 200): Response {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json" },
  });
}
