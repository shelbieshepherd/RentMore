import { sql } from "~/db";
import { readFileSync } from "node:fs";
const raw = readFileSync(".env", "utf8");
for (const line of raw.split("\n")) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
async function main() {
  const idx = await sql()`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'payment_methods'`;
  console.log("UNIQUE INDEXES on payment_methods:");
  for (const i of idx) console.log(`  ${i.indexname}: ${i.indexdef}`);
  console.log("\nrows:", (await sql()`SELECT count(*)::int AS n FROM payment_methods`)[0].n);
  try {
    const c = await sql()`SELECT id FROM companies ORDER BY created_at DESC LIMIT 1`;
    const companyId = c[0].id;
    await sql()`
      INSERT INTO payment_methods (company_id, method_type, label, stripe_pm_id, stripe_customer_id)
      VALUES (${companyId}::uuid, 'credit_card', 'repro-test', 'pm_repro_test_0000000000001', 'cus_repro')
      ON CONFLICT (stripe_pm_id) DO UPDATE SET label = EXCLUDED.label
    `;
    console.log("REPRO INSERT: OK (no error)");
    await sql()`DELETE FROM payment_methods WHERE stripe_pm_id = 'pm_repro_test_0000000000001'`;
  } catch (e: any) {
    console.log("REPRO INSERT ERROR:", e.message);
  }
  process.exit(0);
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
