// Stripe webhook handler (Chunk D — payment reconciliation).
//
// Endpoint: POST /api/stripe/webhook  (Stripe signature verified)
//
// Note: the installed TanStack Start version (1.168.x) no longer ships
// `createAPIFileRoute`, so this handler is wired directly into the two request
// entries instead of a route file:
//   - serve.ts (working environment) intercepts /api/stripe/webhook before the
//     TanStack SSR handler;
//   - vercel-entry.ts (production, Build Output API render function) does the
//     same for every request it receives.
// The URL contract from stripe-connect-scope.md §5 is unchanged.
//
// Events handled:
//   - account.updated                        → companies.stripe_connect_onboarding_complete
//   - payment_intent.succeeded               → insert completed payment row (+ deposit ledger on the booking)
//   - payment_intent.payment_failed          → insert failed payment row (surfaces with "Pay Now" retry)
//   - charge.dispute.created/updated/closed  → mirror dispute state in payments.dispute_status
//   - account.application.deauthorized       → clear onboarding flag (hygiene)
//
// Idempotency: payments.stripe_payment_intent_id has a UNIQUE index
// (uq_payments_stripe_payment_intent_id); every insert uses ON CONFLICT DO
// NOTHING so Stripe retries can never double-insert.
import type Stripe from "stripe";
import { sql } from "~/db";
import { verifyWebhookEvent } from "./stripe";
import { stripeFeeCents } from "./fees";

interface WebhookMeta {
  company_id?: string;
  booking_id?: string;
  property_id?: string;
  payment_type?: string;
  method?: string;
  mode?: string;
}

function metaOf(pi: { metadata?: Record<string, string> | null }): WebhookMeta {
  return (pi.metadata ?? {}) as WebhookMeta;
}

/** Resolve the property id for a payment: metadata wins, else via the booking. */
async function resolvePropertyId(
  propertyId: string | undefined,
  bookingId: string | undefined,
): Promise<string | null> {
  if (propertyId) return propertyId;
  if (!bookingId) return null;
  const rows = await sql()`
    SELECT property_id FROM bookings WHERE id = ${bookingId}::uuid LIMIT 1`;
  return rows[0]?.property_id || null;
}

/**
 * Insert a payment row keyed on stripe_payment_intent_id (idempotent).
 * Returns true only when this call actually inserted the row (false on a
 * Stripe retry of an already-processed event) — callers use that to gate
 * side effects like the booking deposit ledger.
 */
async function upsertPaymentRow(input: {
  companyId: string;
  bookingId?: string;
  propertyId: string | null;
  paymentType: string;
  method: string;
  amountCents: number;
  description: string;
  status: "completed" | "failed";
  paymentIntentId: string;
  processingFeeCents: number;
}): Promise<boolean> {
  const rows = await sql()`
    INSERT INTO payments (company_id, booking_id, property_id, payment_type, method,
                          amount_cents, description, status, stripe_payment_intent_id, processing_fee_cents)
    VALUES (${input.companyId}::uuid, ${input.bookingId ? input.bookingId : null}::uuid,
            ${input.propertyId ? input.propertyId : null}::uuid, ${input.paymentType},
            ${input.method}, ${input.amountCents}, ${input.description}, ${input.status},
            ${input.paymentIntentId}, ${input.processingFeeCents})
    ON CONFLICT (stripe_payment_intent_id) DO NOTHING
    RETURNING id`;
  return rows.length > 0;
}

async function handlePaymentIntent(
  pi: Stripe.PaymentIntent,
  failed: boolean,
): Promise<void> {
  const md = metaOf(pi);
  if (!md.company_id) return; // no company attribution — nothing to reconcile
  const bookingId = md.booking_id;
  const propertyId = await resolvePropertyId(md.property_id, bookingId);
  const pmNetCentsMeta = md.pm_net_cents ? Number(md.pm_net_cents) : NaN;
  const paymentType = md.payment_type === "deposit" ? "deposit" : "charge";
  const method = md.method === "ach" ? "ach" : "credit_card";
  // Fee model (owner Aug 13, FINAL): RentMore takes zero transaction fee. The
  // guest paid booking + convenience fee (pi.amount); Stripe's processing cost
  // comes out of it; the PM receives the rest (booking + leftover). Record the
  // PM-net amount so payouts equal exactly what the PM receives.
  const pmNet = Math.max(
    Number.isFinite(pmNetCentsMeta)
      ? pmNetCentsMeta
      : (pi.amount || 0) - stripeFeeCents(pi.amount || 0, method === "ach" ? "ACH" : "credit card"),
    0,
  );
  const amountCents = pmNet;
  const feeCents = stripeFeeCents(pi.amount || 0, method === "ach" ? "ACH" : "credit card");

  const inserted = await upsertPaymentRow({
    companyId: md.company_id,
    bookingId,
    propertyId,
    paymentType,
    method,
    amountCents,
    description: failed
      ? `Online payment failed (${paymentType === "deposit" ? "deposit" : "balance"})`
      : `Online payment received (${paymentType === "deposit" ? "deposit" : "balance"})`,
    status: failed ? "failed" : "completed",
    paymentIntentId: pi.id,
    processingFeeCents: feeCents,
  });

  // Ledger the non-refundable deposit on the booking so the guest portal's
  // deposit-due math stays correct after a real deposit charge. Only when the
  // row was actually inserted — Stripe retries must not double-ledger.
  if (inserted && !failed && paymentType === "deposit" && bookingId) {
    await sql()`
      UPDATE bookings
      SET deposit_collected_cents = COALESCE(deposit_collected_cents, 0) + ${amountCents}
      WHERE id = ${bookingId}::uuid`;
  }
}

async function handleDispute(
  dispute: Stripe.Dispute,
  phase: "created" | "updated" | "closed",
): Promise<void> {
  const piId = dispute.payment_intent;
  if (!piId) return;
  const disputeStatus =
    phase === "closed" ? `${dispute.status}` : `${phase}`;
  await sql()`
    UPDATE payments SET dispute_status = ${disputeStatus}
    WHERE stripe_payment_intent_id = ${piId}`;
}
/**
 * setup_intent.succeeded — the guest finished the PM-side "collect card/ACH"
 * flow (Stripe-hosted setup mode created by createSetupCheckout on_behalf_of
 * the live connected account). Persist the tokenized PaymentMethod to
 * payment_methods, attributed to the reservation (booking_id) so it shows up
 * on that booking's detail page and can be charged on-demand. Idempotent on
 * stripe_pm_id (unique index) so Stripe retries never double-insert.
 */
async function handleSetupIntent(se: Stripe.SetupIntent): Promise<void> {
  const meta = metaOf(se);
  console.log(`[stripe-webhook] setup_intent.succeeded id=${se.id} acct=${se.on_behalf_of ?? se.account ?? "?"} meta=${JSON.stringify(meta)}`);
  // Only our PM-side collect flow carries company_id (+ ondemand-save flag).
  if (!meta.company_id || meta.mode !== "ondemand-save") return;
  const pmRef = se.payment_method;
  if (!pmRef) return; // a successful setup always yields a payment method
  const pmId = typeof pmRef === "string" ? pmRef : pmRef.id;
  // The Customer the PM is attached to (on the connected account once the
  // collect flow passes `customer`). Needed for the off-session charge later.
  const customerId =
    typeof se.customer === "string" ? se.customer : (se.customer as any)?.id ?? null;
  const companyRows = await sql()`
    SELECT stripe_connect_account_id FROM companies WHERE id = ${meta.company_id}::uuid LIMIT 1`;
  const acctId = companyRows[0]?.stripe_connect_account_id || undefined;
  const { stripe } = await import("~/lib/stripe");
  let pm: Stripe.PaymentMethod;
  try {
    // The PM was created on the connected account (on_behalf_of), so retrieve
    // it in that account's context first; fall back to the platform context.
    pm = await stripe().paymentMethods.retrieve(pmId, acctId ? { stripeAccount: acctId } : undefined);
  } catch {
    pm = await stripe().paymentMethods.retrieve(pmId);
  }
  const card = pm.card;
  const bank = pm.us_bank_account;
  const isAch = meta.method === "ach" || !!bank;
  const methodType = isAch ? "ACH" : "credit_card";
  const cardBrand = card?.brand ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : undefined;
  const label = isAch
    ? `ACH · ${bank?.bank_name || "Bank"} ····${bank?.last4 || ""}`
    : `Card · ${cardBrand || ""} ····${card?.last4 || ""}`.trim();
  await sql()`
    INSERT INTO payment_methods (company_id, property_id, booking_id, method_type, label,
      card_last4, card_expiry, card_brand, bank_name, account_last4, stripe_pm_id, stripe_customer_id)
    VALUES (${meta.company_id}::uuid,
      ${meta.property_id || null}::uuid, ${meta.booking_id || null}::uuid,
      ${methodType}, ${label || null},
      ${card?.last4 || null}, ${card ? `${card.exp_month}/${String(card.exp_year).slice(-2)}` : null},
      ${cardBrand || null}, ${bank?.bank_name || null}, ${bank?.last4 || null},
      ${pmId}, ${customerId})
    ON CONFLICT (stripe_pm_id) DO UPDATE SET
      booking_id = EXCLUDED.booking_id,
      label = EXCLUDED.label, card_last4 = EXCLUDED.card_last4,
      card_brand = EXCLUDED.card_brand, stripe_customer_id = EXCLUDED.stripe_customer_id
  `;
}

/**
 * Process a verified Stripe webhook. Returns the Response to send back to
 * Stripe — always 200 for handled events (even no-ops) so Stripe stops
 * retrying; 400 only for signature failures.
 */
export async function handleStripeWebhook(
  rawBody: string,
  signature: string | null,
): Promise<Response> {
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  if (!signature) {
    return json({ error: "missing stripe-signature header" }, 400);
  }
  let event: Stripe.Event;
  try {
    event = await verifyWebhookEvent(rawBody, signature);
    console.log(`[stripe-webhook] verified ${event.type} id=${(event.data?.object as any)?.id || "-"} acct=${(event.data?.object as any)?.account || "-"}`);
  } catch (err: any) {
    console.error("[stripe-webhook] signature verification failed:", err?.message);
    return json({ error: "invalid signature" }, 400);
  }

  try {
    switch (event.type) {
      case "account.updated": {
        const acct = event.data.object as Stripe.Account;
        // Onboarding is only "complete" when the account can actually charge:
        const complete = !!(
          acct.details_submitted &&
          acct.charges_enabled &&
          acct.capabilities?.card_payments === "active"
        );
        await sql()`
          UPDATE companies SET stripe_connect_onboarding_complete = ${complete}
          WHERE stripe_connect_account_id = ${acct.id}`;
        break;
      }
      case "account.application.deauthorized": {
        const acct = event.data.object as Stripe.Account;
        await sql()`
          UPDATE companies SET stripe_connect_onboarding_complete = false
          WHERE stripe_connect_account_id = ${acct.id}`;
        break;
      }
      case "payment_intent.succeeded": {
        await handlePaymentIntent(event.data.object as Stripe.PaymentIntent, false);
        break;
      }
      case "payment_intent.payment_failed": {
        await handlePaymentIntent(event.data.object as Stripe.PaymentIntent, true);
        break;
      }
      case "charge.dispute.created": {
        await handleDispute(event.data.object as Stripe.Dispute, "created");
        break;
      }
      case "charge.dispute.updated": {
        await handleDispute(event.data.object as Stripe.Dispute, "updated");
        break;
      }
      case "charge.dispute.closed": {
        await handleDispute(event.data.object as Stripe.Dispute, "closed");
        break;
      }
      case "setup_intent.succeeded": {
        await handleSetupIntent(event.data.object as Stripe.SetupIntent);
        break;
      }
      default:
        // Event subscribed but not yet handled (e.g. transfer.* for v2) — ack.
        break;
    }
    return json({ received: true }, 200);
  } catch (err: any) {
    // Log detail server-side; Stripe will retry the event (fine — handlers are
    // idempotent). Returning 500 keeps the event in Stripe's retry queue.
    console.error(`[stripe-webhook] handler error on ${event.type}:`, err?.message);
    return json({ error: "handler error" }, 500);
  }
}
