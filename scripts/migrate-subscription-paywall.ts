// Subscription paywall migration (Aug 2026):
//  1. Add companies.subscription_expires_at (idempotent).
//  2. Create subscription_checkouts table (idempotent) — UNIQUE session_id
//     for idempotent success-return marking (same Stripe session never
//     double-marks a company).
//  3. Grandfather EXISTING companies: every company that already carries a
//     paid tier name (starter/growth/pro/enterprise) gets a 30-day paid
//     window starting now, so launch doesn't hard-lock current users.
//     New signups (registerCompany) land as 'free' + NULL expiry (unpaid).
// Run from the site dir (Bun auto-loads .env):  bun run scripts/migrate-subscription-paywall.ts
import { sql } from "../src/db";
const db = sql();
async function main() {
  // 1. Column
  await db`ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ`;
  console.log("column ok: companies.subscription_expires_at");
  // The original schema CHECK-constrains subscription_tier to the 4 paid
  // tiers; the paywall needs 'free' (unpaid) + '*_pending' markers, so drop it.
  await db`ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_subscription_tier_check`;
  console.log("constraint ok: companies_subscription_tier_check dropped (tier now free-text)");
  // 2. Idempotent-checkout table
  await db`
    CREATE TABLE IF NOT EXISTS subscription_checkouts (
      session_id TEXT PRIMARY KEY,
      company_id UUID NOT NULL REFERENCES companies(id),
      tier TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  console.log("table ok: subscription_checkouts (session_id PK)");
  // 3. Grandfather existing paid-tier companies (30-day window from now)
  const res = await db`
    UPDATE companies
    SET subscription_expires_at = now() + interval '30 days'
    WHERE subscription_tier IN ('starter', 'growth', 'pro', 'enterprise')
      AND subscription_expires_at IS NULL
  `;
  console.log(`grandfathered existing paid-tier companies: ${res.length ? "done" : "0 rows (already set)"}`);
  const sample = await db`
    SELECT id, name, subscription_tier, subscription_expires_at
    FROM companies ORDER BY created_at LIMIT 6
  `;
  console.log("sample rows:", JSON.stringify(sample, null, 2));
}
main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
