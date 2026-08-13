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
  } catch (err: any) {
    console.error("[stripe-webhook] signature verification failed:", err?.message);
    return json({ error: "invalid signature" }, 400);
  }

  try {
    switch (event.type) {
      case "account.updated": {
        const acct = event.data.object as Stripe.Account;
        const complete = !!(acct.details_submitted && acct.charges_enabled);
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
