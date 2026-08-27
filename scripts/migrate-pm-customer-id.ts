// Collect-card fix migration (Aug 2026):
//  Add payment_methods.stripe_customer_id so we persist which Stripe Customer
//  (on the CONNECTED account) a saved PaymentMethod belongs to. Off-session
//  charges (createOnDemandCharge with on_behalf_of) require the PM to be
//  attached to a Customer on the connected account — the collect flow now
//  ensures this (see createSetupCheckout), and this column records it so the
//  charge can pass `customer`.
// Run from the site dir (Bun auto-loads .env):  bun run scripts/migrate-pm-customer-id.ts
import { sql } from "../src/db";
const db = sql();
async function main() {
  await db`ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`;
  console.log("column ok: payment_methods.stripe_customer_id");
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
