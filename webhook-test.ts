// Chunk D webhook E2E test — signs synthetic Stripe events and exercises
// handleStripeWebhook against the live DB, then cleans up every mutation.
// Run: bun run /tmp/webhook-test.ts   (from /home/team/shared/site)
import Stripe from "stripe";
import { handleStripeWebhook } from "./src/lib/stripe-webhook";

const secret = "whsec_test_chunkD_1234567890abcdef";
process.env.STRIPE_WEBHOOK_SECRET = secret;
process.env.STRIPE_SECRET_KEY = "sk_test_fake_for_local_signing";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const DATABASE_URL = (process.env.DATABASE_URL || "").replace(/^"|"$/g, "");
const { neon } = await import("@neondatabase/serverless");
const sql = neon(DATABASE_URL);

const COMPANY = "00000000-0000-0000-0000-000000000001"; // demo company (only company with bookings)
const CONNECT_CO = "c0f28972-0029-4a6c-979a-fe14cc7bb213"; // Fresh New Co (has the connected account)
const CONNECT_ACCT = "acct_1U3aRHGrO5c9vPRg";

async function q(text: string, ...args: unknown[]) {
  return sql.query(text, args as any[]);
}

let passed = 0, failed = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}

async function send(payload: object, sigOverride?: string | null) {
  const raw = JSON.stringify(payload);
  const sig = sigOverride === undefined
    ? await stripe.webhooks.generateTestHeaderStringAsync({ payload: raw, secret })
    : sigOverride;
  return handleStripeWebhook(raw, sig);
}

// ── fixtures ──
const booking = (await q(
  "SELECT id, property_id, company_id, deposit_collected_cents, reservation_number FROM bookings WHERE company_id = $1::uuid AND property_id IS NOT NULL ORDER BY created_at LIMIT 1",
  COMPANY,
))[0] as any;
if (!booking) { console.error("no booking for company"); process.exit(1); }
console.log(`fixtures: booking=${booking.id} property=${booking.property_id} depositCollected=${booking.deposit_collected_cents}`);

const company = (await q(
  "SELECT stripe_connect_account_id, stripe_connect_onboarding_complete FROM companies WHERE id = $1::uuid",
  CONNECT_CO,
))[0] as any;
console.log(`fixtures: connected acct=${company.stripe_connect_account_id} onboardingComplete=${company.stripe_connect_onboarding_complete}`);

const PI_OK = "pi_test_chunkD_succeeded_001";
const PI_FAIL = "pi_test_chunkD_failed_001";
const AMOUNT = 50000; // $500 deposit
const FEE = Math.round(AMOUNT * 0.029 + 30); // card processingFee

const piEvent = (type: string, pi: Record<string, unknown>) => ({
  id: `evt_test_chunkD_${Date.now()}`,
  object: "event",
  api_version: "2024-06-20",
  created: Math.floor(Date.now() / 1000),
  livemode: false,
  pending_webhooks: 0,
  request: { id: "req_test", idempotency_key: "idem_test" },
  type,
  data: { object: pi },
});

const makePi = (id: string, meta: Record<string, string>, extra: Record<string, unknown> = {}) => ({
  id,
  object: "payment_intent",
  amount: AMOUNT,
  currency: "usd",
  status: "succeeded",
  application_fee_amount: FEE,
  payment_method_types: ["card"],
  metadata: meta,
  ...extra,
});

const okMeta = {
  company_id: COMPANY,
  booking_id: booking.id,
  property_id: booking.property_id,
  payment_type: "deposit",
  method: "card",
};

// ── 1. missing signature → 400 ──
console.log("\n1) signature enforcement");
let r = await send({ type: "payment_intent.succeeded", data: {} }, null);
check("missing signature rejected (400)", r.status === 400, `status=${r.status}`);

// ── 2. payment_intent.succeeded → completed row + deposit ledger ──
console.log("\n2) payment_intent.succeeded");
r = await send(piEvent("payment_intent.succeeded", makePi(PI_OK, okMeta)));
check("200 received", r.status === 200, `status=${r.status}`);
const payRow = (await q(
  "SELECT id, company_id, booking_id, property_id, payment_type, method, amount_cents, status, stripe_payment_intent_id, processing_fee_cents FROM payments WHERE stripe_payment_intent_id = $1",
  PI_OK,
))[0] as any;
check("payment row inserted", !!payRow);
if (payRow) {
  check("company matches", payRow.company_id === COMPANY);
  check("booking matches", payRow.booking_id === booking.id);
  check("property matches", payRow.property_id === booking.property_id);
  check("payment_type=deposit", payRow.payment_type === "deposit");
  check("method=credit_card", payRow.method === "credit_card");
  check("amount_cents=50000", payRow.amount_cents === AMOUNT);
  check("status=completed", payRow.status === "completed");
  check("processing_fee_cents matches fees.ts", payRow.processing_fee_cents === FEE, `got=${payRow.processing_fee_cents} want=${FEE}`);
}
const depAfter = (await q(
  "SELECT deposit_collected_cents FROM bookings WHERE id = $1::uuid", booking.id,
))[0] as any;
check("deposit_collected bumped by $500", depAfter.deposit_collected_cents === (Number(booking.deposit_collected_cents) + AMOUNT),
  `got=${depAfter.deposit_collected_cents} want=${Number(booking.deposit_collected_cents) + AMOUNT}`);

// ── 3. idempotency: replay same event → no double insert ──
console.log("\n3) idempotency (Stripe retry)");
r = await send(piEvent("payment_intent.succeeded", makePi(PI_OK, okMeta)));
check("replay 200", r.status === 200);
const dupCount = (await q("SELECT count(*)::int AS n FROM payments WHERE stripe_payment_intent_id = $1", PI_OK))[0];
check("no double insert", dupCount.n === 1, `n=${dupCount.n}`);
const depReplay = (await q("SELECT deposit_collected_cents FROM bookings WHERE id = $1::uuid", booking.id))[0];
check("deposit not double-ledgered", depReplay.deposit_collected_cents === depAfter.deposit_collected_cents);

// ── 4. payment_intent.payment_failed → failed row (retryable in UI) ──
console.log("\n4) payment_intent.payment_failed");
r = await send(piEvent("payment_intent.payment_failed", makePi(PI_FAIL, okMeta, { status: "requires_payment_method" })));
check("200 received", r.status === 200);
const failRow = (await q(
  "SELECT status, payment_type, method FROM payments WHERE stripe_payment_intent_id = $1", PI_FAIL,
))[0] as any;
check("failed row inserted with status=failed", failRow && failRow.status === "failed", JSON.stringify(failRow));

// ── 5. disputes mirror on the completed row ──
console.log("\n5) charge.dispute.created / closed");
const dispute = (status: string) => ({
  id: "dp_test_001",
  object: "dispute",
  status,
  payment_intent: PI_OK,
  amount: AMOUNT,
  currency: "usd",
  reason: "fraudulent",
});
r = await send(piEvent("charge.dispute.created", dispute("needs_response")));
check("dispute.created 200", r.status === 200);
let disputeStatus = (await q("SELECT dispute_status FROM payments WHERE stripe_payment_intent_id = $1", PI_OK))[0];
check("dispute_status=created", disputeStatus.dispute_status === "created", `got=${disputeStatus.dispute_status}`);
r = await send(piEvent("charge.dispute.closed", dispute("lost")));
check("dispute.closed 200", r.status === 200);
disputeStatus = (await q("SELECT dispute_status FROM payments WHERE stripe_payment_intent_id = $1", PI_OK))[0];
check("dispute_status=lost", disputeStatus.dispute_status === "lost", `got=${disputeStatus.dispute_status}`);

// ── 6. account.updated → onboarding flag mirrors details_submitted+charges_enabled ──
console.log("\n6) account.updated");
const acctEvent = (ds: boolean, ce: boolean) => ({
  object: "account",
  id: CONNECT_ACCT,
  details_submitted: ds,
  charges_enabled: ce,
});
r = await send(piEvent("account.updated", acctEvent(true, true)));
check("account.updated 200", r.status === 200);
let co = (await q("SELECT stripe_connect_onboarding_complete FROM companies WHERE id = $1::uuid", CONNECT_CO))[0];
check("onboarding set true", co.stripe_connect_onboarding_complete === true);
r = await send(piEvent("account.updated", acctEvent(true, false)));
co = (await q("SELECT stripe_connect_onboarding_complete FROM companies WHERE id = $1::uuid", CONNECT_CO))[0];
check("charges_enabled=false → onboarding false", co.stripe_connect_onboarding_complete === false);

// ── 7. bad signature → 400 ──
console.log("\n7) bad signature");
r = await send(piEvent("payment_intent.succeeded", makePi(PI_OK, okMeta)), "t=1,v1=bogus");
check("tampered signature rejected (400)", r.status === 400, `status=${r.status}`);

// ── cleanup: remove every mutation ──
console.log("\ncleanup");
await q("DELETE FROM payments WHERE stripe_payment_intent_id IN ($1, $2)", PI_OK, PI_FAIL);
await q("UPDATE bookings SET deposit_collected_cents = $1 WHERE id = $2::uuid", Number(booking.deposit_collected_cents), booking.id);
await q("UPDATE companies SET stripe_connect_onboarding_complete = $1 WHERE id = $2::uuid", company.stripe_connect_onboarding_complete, CONNECT_CO);
const leftover = (await q("SELECT count(*)::int AS n FROM payments WHERE stripe_payment_intent_id LIKE 'pi_test_chunkD%'"))[0];
check("test rows removed", leftover.n === 0, `n=${leftover.n}`);
console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
