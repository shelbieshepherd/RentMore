// Password-reset migration (Aug 2026):
//  1. Add password_reset_token / password_reset_expires to users (idempotent).
//  2. LOWER() every user email (case-insensitive auth), aborting without
//     clobbering if any per-company case-collision exists (report instead).
// Run from the site dir (Bun auto-loads .env):  bun run scripts/migrate-password-reset.ts
import { sql } from "../src/db";

const db = sql();

async function main() {
  // 1. Columns
  await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token TEXT`;
  await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ`;
  console.log("columns ok: password_reset_token, password_reset_expires");

  // 2. Case-collision check (per company, since UNIQUE(company_id, email))
  const collisions = await db`
    SELECT company_id, LOWER(email) AS email_lower, COUNT(*) AS n,
           array_agg(email ORDER BY created_at DESC) AS emails
    FROM users
    GROUP BY company_id, LOWER(email)
    HAVING COUNT(*) > 1
  `;
  if (collisions.length > 0) {
    console.error("ABORT: case-collisions found — not touching emails. Review manually:");
    for (const c of collisions) {
      console.error(`  company ${c.company_id}: ${c.email_lower} x${c.n} -> ${c.emails.join(", ")}`);
    }
    process.exit(1);
  }

  // 3. Lowercase all emails (idempotent)
  const res = await db`UPDATE users SET email = LOWER(email)`;
  console.log(`emails lowercased: ${res.length ? "done" : "0 rows changed (already lowercase)"}`);

  const sample = await db`SELECT email, password_reset_token, password_reset_expires FROM users ORDER BY created_at DESC LIMIT 5`;
  console.log("sample rows:", JSON.stringify(sample, null, 2));
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
