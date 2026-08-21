// Migration: attribute a saved payment method to a reservation (booking_id)
// + unique index on stripe_pm_id (required for the idempotent upsert in
// saveTokenizedPaymentMethod and the setup_intent.succeeded webhook).
// Owner direction (Aug 20): collect the guest's card/ACH once from the
// reservation and charge it on-demand from the booking detail page.
import { neon } from "@neondatabase/serverless";

const url = (process.env.DATABASE_URL || "").replace(/['"]/g, "");
const sql = neon(url);

async function main() {
  const stmts = [
    // Link a saved method to the reservation it was collected for.
    `ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings(id)`,
    // saveTokenizedPaymentMethod uses ON CONFLICT (stripe_pm_id) — needs a
    // unique constraint (multiple NULLs are allowed by Postgres, so existing
    // manually-entered methods with no token stay fine).
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_methods_stripe_pm_id ON payment_methods(stripe_pm_id)`,
    // Faster lookup of methods per reservation.
    `CREATE INDEX IF NOT EXISTS idx_payment_methods_booking ON payment_methods(booking_id)`,
  ];
  for (const s of stmts) {
    try {
      await sql.query(s);
      console.log("OK:", s.slice(0, 80));
    } catch (e: any) {
      if (e.message && e.message.indexOf("already exists") >= 0) {
        console.log("SKIP(already exists):", s.slice(0, 60));
      } else {
        console.error("FAIL:", s.slice(0, 80), e.message);
      }
    }
  }
  const cols = await sql.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='payment_methods' AND column_name IN ('booking_id','stripe_pm_id') ORDER BY column_name`,
  );
  console.log("columns:", JSON.stringify(cols.map((c: any) => c.column_name)));
  const idxs = await sql.query(
    `SELECT indexname FROM pg_indexes WHERE tablename='payment_methods' AND indexname IN ('uq_payment_methods_stripe_pm_id','idx_payment_methods_booking') ORDER BY indexname`,
  );
  console.log("indexes:", JSON.stringify(idxs.map((i: any) => i.indexname)));
}

main().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
