// One-off migration: create payouts table for the DB-backed payout lifecycle.
// Run: bun run scripts/migrate-payouts-table.ts
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(".env", "utf8");
const match = env.match(/^DATABASE_URL=(.+)$/m);
if (!match) throw new Error("DATABASE_URL not found in .env");
const url = match[1].trim().replace(/^"|"$/g, "");

const sql = neon(url);
const [exists] = await sql`SELECT 1 FROM information_schema.tables WHERE table_name = 'payouts'`;
if (exists) {
  console.log("payouts table already exists — skipping create, verifying schema…");
} else {
  await sql`
    CREATE TABLE payouts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      owner_id uuid NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
      property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
      period_start date NOT NULL,
      period_end date NOT NULL,
      gross_cents bigint NOT NULL DEFAULT 0,
      management_fee_cents bigint NOT NULL DEFAULT 0,
      maintenance_deductions_cents bigint NOT NULL DEFAULT 0,
      net_cents bigint NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'calculated' CHECK (status IN ('calculated','pending','paid')),
      method text NOT NULL DEFAULT 'ach' CHECK (method IN ('ach','check')),
      paid_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_payouts_company ON payouts (company_id, period_start, period_end)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_payouts_owner ON payouts (owner_id)`;
  console.log("payouts table created");
}

// Verify schema shape
const cols = await sql`
  SELECT column_name, data_type, is_nullable FROM information_schema.columns
  WHERE table_name = 'payouts' ORDER BY ordinal_position
`;
console.log(cols.map((c: any) => `${c.column_name} ${c.data_type} ${c.is_nullable === "NO" ? "NOT NULL" : ""}`).join("\n"));

const checks = await sql`
  SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
  WHERE conrelid = 'payouts'::regclass
`;
console.log("constraints:", checks.map((c: any) => c.def).join(" | "));
