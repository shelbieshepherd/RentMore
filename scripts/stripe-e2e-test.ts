// Stripe Connect v1 — Chunk F real test-mode E2E harness (one command).
//
// Run:  STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=... bun run scripts/stripe-e2e-test.ts
//       (keys live in the owner's Vercel env; for local runs export them, or run
//        against the deployed app which has them set.)
//
// What it does (full real test-mode loop, Chunk F scope):
//   1. Checks the Fresh New Co test Express account status. If onboarding is NOT
//      complete (owner's hCaptcha step), it prints exactly what is blocked and
//      exits 2 — nothing else runs, nothing mutates.
//   2. Onboarded path: creates a Checkout session on the CONNECTED account
//      (on_behalf_of + application_fee_amount from fees.ts — separate-charges
//      model, no transfer_data/destination), confirms the PaymentIntent with the
//      Stripe test card 4242 4242 4242 4242, then feeds a real
//      payment_intent.succeeded event (signed with the test webhook secret) into
//      handleStripeWebhook and asserts:
//        - payment row created: correct company/booking/property/payment_type/
//          method/amount + processing_fee_cents (matches fees.ts) + status
//          completed + stripe_payment_intent_id unique
//        - deposit payment → bookings.deposit_collected_cents ledgered once
//        - idempotent replay (same event again) → no double insert / no double
//          ledger
//        - payment_intent.payment_failed → failed row
//        - charge.dispute.created/closed → dispute_status mirroring
//        - account.updated (details_submitted+charges_enabled) flips the company
//          onboarding flag both directions
//        - tampered signature → 400
//   3. Cleanup: deletes every row it created and restores company flags.
//
// Reuse: mirrors webhook-test.ts structure; add REAL Stripe API calls for the
// session/PI leg. The assert leg is identical to the (26/26) synthetic suite, so
// when onboarding completes this becomes the full live proof.
import Stripe from "stripe";
import { handleStripeWebhook } from "../src/lib/stripe-webhook";
import { processingFee } from "../src/lib/fees";

const CONNECT_CO = "c0f28972-0029-4a6c-979a-fe14cc7bb213"; // Fresh New Co
// Connected account id is DB-driven — it changes per Connect platform (the old
// acct_1U3aRHGrO5c9vPRg belongs to the retired sandbox). NULL until the company
// runs createConnectAccount on the current platform.
const AMOUNT_CENTS = 100000; // $1,000.00 deposit (8-night block fixture = 2 blocks)
const CARD_FEE = processingFee(AMOUNT_CENTS, "credit card"); // 2.9%+$0.30 = 2930¢

const key = process.env.STRIPE_SECRET_KEY;
const whsec = process.env.STRIPE_WEBHOOK_SECRET || "whsec_test_chunkD_1234567890abcdef";
if (!key) {
  console.error("STRIPE_SECRET_KEY is not set — export the owner's Connect test key (Vercel env) to run this harness.");
  process.exit(2);
}
const stripe = new Stripe(key);
process.env.STRIPE_WEBHOOK_SECRET = whsec;

const DATABASE_URL = (process.env.DATABASE_URL || "").replace(/^"|"$/g, "");
const { neon } = await import("@neondatabase/serverless");
const sql = neon(DATABASE_URL);
const q = (text: string, ...args: unknown[]) => sql.query(text, args as any[]);

let passed = 0, failed = 0, skipped = 0;
const check = (name: string, cond: boolean, extra = "") => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
};

async function signAndSend(payload: object, sigOverride?: string | null) {
  const raw = JSON.stringify(payload);
  const sig = sigOverride === undefined
    ? await stripe.webhooks.generateTestHeaderStringAsync({ payload: raw, secret: whsec })
    : sigOverride;
  return handleStripeWebhook(raw, sig);
}

// ── 1. Precondition: account onboarding state ──
const coRow = (await q("SELECT stripe_connect_account_id FROM companies WHERE id = $1::uuid", CONNECT_CO))[0];
const CONNECT_ACCT: string = coRow?.stripe_connect_account_id;
if (!CONNECT_ACCT) {
  console.error(`
BLOCKED: Fresh New Co has no Stripe Connect account on the current platform
(DB stripe_connect_account_id is NULL — the old acct_1U3aRHGrO5c9vPRg belonged
to the retired sandbox).
One-time owner action (~1 min): login fresh-0810@test.com → Settings → Payments →
"Connect Stripe" (creates the account on the new platform) → then re-run this
harness; it will stop at the hCaptcha onboarding step if still needed.`);
  process.exit(2);
}
const acct = await stripe.accounts.retrieve(CONNECT_ACCT);
console.log(`\n=== Stripe Connect E2E — account ${CONNECT_ACCT} ===`);
console.log(`  details_submitted=${acct.details_submitted} charges_enabled=${acct.charges_enabled} payouts_enabled=${acct.payouts_enabled}`);
if (!acct.details_submitted || !acct.charges_enabled) {
  console.error(`
BLOCKED: Fresh New Co's test-mode Express onboarding is NOT complete.
Owner action (one time, ~30s): login fresh-0810@test.com → Settings → Payments →
Resume onboarding → Stripe-hosted Express (test phone, SSN 000-00-0000,
bank 000123456789) → submit. Then re-run this harness — nothing else needed.
(Stripe gates the business-details step behind hCaptcha; automation cannot do it.)`);
  process.exit(2);
}

// ── 2. Real payment leg ──
// Fixture: a demo-company short-term booking to attach the deposit to (mirrors
// the app's createCheckoutSession metadata contract).
const booking = (await q(
  "SELECT id, property_id, company_id, deposit_collected_cents, reservation_number FROM bookings WHERE company_id = $1::uuid AND property_id IS NOT NULL ORDER BY created_at LIMIT 1",
  "00000000-0000-0000-0000-000000000001",
))[0];
check("fixture booking exists", !!booking?.id);
const depositBefore = Number(booking?.deposit_collected_cents ?? 0);
const meta = {
  company_id: CONNECT_CO,
  booking_id: booking?.id ?? "",
  property_id: booking?.property_id ?? "",
  payment_type: "deposit",
  method: "card",
};

console.log("\n--- creating Checkout session on the connected account (Option A) ---");
const session = await stripe.checkout.sessions.create({
  mode: "payment",
  line_items: [{ price_data: { currency: "usd", product_data: { name: "RentMore booking deposit" }, unit_amount: AMOUNT_CENTS }, quantity: 1 }],
  metadata: meta,
  payment_intent_data: { application_fee_amount: CARD_FEE, on_behalf_of: CONNECT_ACCT, metadata: meta },
  payment_method_types: ["card"],
  success_url: "https://rentmorevrs.ctonew.app/payments?checkout=success&session_id={CHECKOUT_SESSION_ID}",
  cancel_url: "https://rentmorevrs.ctonew.app/payments?checkout=cancelled",
});
console.log(`  session ${session.id} created (url present: ${!!session.url})`);
check("checkout session created on connected account", !!session.id);
const session2 = await stripe.checkout.sessions.retrieve(session.id);
check("session payment_intent exists", !!session2.payment_intent);

// Pay with the test card (hosted Checkout is human-only; confirm the PI the
// session created, exactly as the card form would).
const pi = await stripe.paymentIntents.confirm(session2.payment_intent as string, {
  payment_method_data: {
    type: "card",
    card: { number: "4242424242424242", exp_month: 12, exp_year: 2034, cvc: "123" },
  },
});
check("payment_intent confirmed with test card 4242", pi.status === "succeeded", `status=${pi.status}`);
check("application_fee_amount on the PI", pi.application_fee_amount === CARD_FEE, `fee=${pi.application_fee_amount} want ${CARD_FEE}`);
check("merchant of record is the connected account", pi.on_behalf_of === CONNECT_ACCT || (pi as any).on_behalf_of === CONNECT_ACCT);
check("no transfer_data / no destination (no-liability rule)", !pi.transfer_data && !(pi as any).destination);

// ── 3. Webhook leg (real PI id, synthetic signed event) ──
console.log("\n--- payment_intent.succeeded webhook → payment row ---");
const piEvent: Record<string, any> = {
  id: `evt_e2e_pi_${Date.now()}`, object: "event", type: "payment_intent.succeeded",
  data: { object: { id: pi.id, object: "payment_intent", amount: pi.amount, currency: "usd",
    application_fee_amount: pi.application_fee_amount, metadata: pi.metadata } },
};
let res = await signAndSend(piEvent);
check("succeeded webhook → 200", res.status === 200);
const row = (await q("SELECT * FROM payments WHERE stripe_payment_intent_id = $1", pi.id))[0];
check("payment row created", !!row?.id);
check("company_id = Fresh New Co", row?.company_id === CONNECT_CO, String(row?.company_id));
check("booking/property attached", !!row?.booking_id && !!row?.property_id);
check("payment_type = deposit", row?.payment_type === "deposit", String(row?.payment_type));
check("method = credit_card", row?.method === "credit_card", String(row?.method));
check("amount_cents matches", Number(row?.amount_cents) === AMOUNT_CENTS, String(row?.amount_cents));
check("processing_fee_cents matches fees.ts", Number(row?.processing_fee_cents) === CARD_FEE, String(row?.processing_fee_cents));
check("status completed", row?.status === "completed", String(row?.status));
const depositAfter = Number((await q("SELECT deposit_collected_cents FROM bookings WHERE id = $1::uuid", booking.id))[0].deposit_collected_cents);
check("deposit ledgered once (+$1,000)", depositAfter === depositBefore + AMOUNT_CENTS, `${depositBefore}→${depositAfter}`);

// ── 4. Idempotent replay ──
console.log("\n--- idempotency (Stripe retry) ---");
res = await signAndSend(piEvent);
check("replay 200", res.status === 200);
const count = (await q("SELECT COUNT(*) c FROM payments WHERE stripe_payment_intent_id = $1", pi.id))[0].c;
check("no double insert", Number(count) === 1, `count=${count}`);
const depositAfterReplay = Number((await q("SELECT deposit_collected_cents FROM bookings WHERE id = $1::uuid", booking.id))[0].deposit_collected_cents);
check("deposit not double-ledgered", depositAfterReplay === depositBefore + AMOUNT_CENTS);

// ── 5. payment_failed ──
console.log("\n--- payment_intent.payment_failed ---");
const failId = `pi_e2e_fail_${Date.now()}`;
res = await signAndSend({ id: `evt_e2e_f_${Date.now()}`, object: "event", type: "payment_intent.payment_failed",
  data: { object: { id: failId, object: "payment_intent", amount: AMOUNT_CENTS, currency: "usd",
    application_fee_amount: CARD_FEE, metadata: meta } } });
check("failed 200", res.status === 200);
const frow = (await q("SELECT status FROM payments WHERE stripe_payment_intent_id = $1", failId))[0];
check("failed row status=failed", frow?.status === "failed", String(frow?.status));

// ── 6. Dispute mirror ──
console.log("\n--- charge.dispute.created / closed ---");
const disputeId = `dp_e2e_${Date.now()}`;
res = await signAndSend({ id: `evt_e2e_d1_${Date.now()}`, object: "event", type: "charge.dispute.created",
  data: { object: { id: disputeId, object: "dispute", status: "needs_response", payment_intent: pi.id } } });
check("dispute.created 200", res.status === 200);
const d1 = (await q("SELECT dispute_status FROM payments WHERE stripe_payment_intent_id = $1", pi.id))[0];
check("dispute_status=created", d1?.dispute_status === "created", String(d1?.dispute_status));
res = await signAndSend({ id: `evt_e2e_d2_${Date.now()}`, object: "event", type: "charge.dispute.closed",
  data: { object: { id: disputeId, object: "dispute", status: "lost", payment_intent: pi.id } } });
const d2 = (await q("SELECT dispute_status FROM payments WHERE stripe_payment_intent_id = $1", pi.id))[0];
check("dispute_status=lost after closed", d2?.dispute_status === "lost", String(d2?.dispute_status));

// ── 7. account.updated onboarding flag ──
console.log("\n--- account.updated onboarding flag ---");
res = await signAndSend({ id: `evt_e2e_a1_${Date.now()}`, object: "event", type: "account.updated",
  data: { object: { id: CONNECT_ACCT, object: "account", details_submitted: true, charges_enabled: true } } });
const flag = (await q("SELECT stripe_connect_onboarding_complete FROM companies WHERE id = $1::uuid", CONNECT_CO))[0];
check("onboarding set true", !!flag?.stripe_connect_onboarding_complete);
res = await signAndSend({ id: `evt_e2e_a2_${Date.now()}`, object: "event", type: "account.updated",
  data: { object: { id: CONNECT_ACCT, object: "account", details_submitted: true, charges_enabled: false } } });
const flag2 = (await q("SELECT stripe_connect_onboarding_complete FROM companies WHERE id = $1::uuid", CONNECT_CO))[0];
check("charges_enabled=false → onboarding false", !flag2?.stripe_connect_onboarding_complete);

// ── 8. Bad signature ──
console.log("\n--- bad signature ---");
res = await signAndSend({ id: "x", object: "event", type: "payment_intent.succeeded", data: {} }, "t=1,v1=deadbeef");
check("tampered signature rejected (400)", res.status === 400);

// ── 9. Cleanup ──
console.log("\ncleanup");
await q("DELETE FROM payments WHERE stripe_payment_intent_id = ANY($1::text[])", [pi.id, failId]);
await q("UPDATE bookings SET deposit_collected_cents = $1 WHERE id = $2::uuid", depositBefore, booking.id);
await q("UPDATE companies SET stripe_connect_onboarding_complete = false WHERE id = $1::uuid", CONNECT_CO);
const leftover = (await q("SELECT COUNT(*) c FROM payments WHERE stripe_payment_intent_id IN ($1, $2)", pi.id, failId))[0].c;
check("test rows removed", Number(leftover) === 0);

console.log(`\nRESULT: ${passed} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed ? 1 : 0);
