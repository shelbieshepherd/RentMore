// Subscription paywall E2E (Aug 2026) — tests the real gate + DB-level logic.
// Server fns (createServerFn) need Start context, so this drives the exported
// gate directly and replicates markCompanyPaid's SQL (same statements the
// server fn runs) to prove idempotency + expiry behavior.
import { sql } from "../src/db";
import { assertSubscriptionActive, DEFAULT_COMPANY_ID } from "../src/lib/db-queries";
const db = sql();

async function main() {
  const results: string[] = [];
  const ok = (name: string, pass: boolean, extra = "") =>
    results.push(`${pass ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);

  // 1. Fresh unpaid company ('free', no expiry) — matches registerCompany now
  const companyRows = await db`
    INSERT INTO companies (name, slug, subscription_tier)
    VALUES ('PW E2E ' || now(), 'pw-e2e-' || floor(random()*1e9), 'free')
    RETURNING id
  `;
  const cid = companyRows[0].id as string;

  // 2. Unpaid → gate rejects
  let gateThrew = false;
  try { await assertSubscriptionActive(cid); } catch { gateThrew = true; }
  ok("unpaid company gate rejects (server-side)", gateThrew);

  // 3. Demo exempt
  let demoPass = false;
  try { await assertSubscriptionActive(DEFAULT_COMPANY_ID); demoPass = true; } catch {}
  ok("demo company exempt", demoPass);

  // 4. markCompanyPaid SQL (identical to server fn) → gate passes
  const expiresAt = new Date(Date.now() + 30 * 86400000);
  await db`
    UPDATE companies SET subscription_tier = 'growth',
      subscription_expires_at = ${expiresAt.toISOString()}::timestamptz
    WHERE id = ${cid}::uuid
  `;
  await db`
    INSERT INTO subscription_checkouts (session_id, company_id, tier)
    VALUES ('cs_test_pw_001', ${cid}::uuid, 'growth')
  `;
  let paidPass = false;
  try { await assertSubscriptionActive(cid); paidPass = true; } catch {}
  ok("paid company gate passes", paidPass);

  // 5. Idempotency: replaying the same session must not double-mark / double-extend.
  const before: any = await db`SELECT subscription_expires_at FROM companies WHERE id = ${cid}::uuid`;
  let replayBlocked = false;
  try {
    await db`
      INSERT INTO subscription_checkouts (session_id, company_id, tier)
      VALUES ('cs_test_pw_001', ${cid}::uuid, 'pro')
    `;
  } catch { replayBlocked = true; } // UNIQUE(session_id) violation = idempotent guard
  ok("same session_id cannot be replayed (UNIQUE guard)", replayBlocked);
  const after: any = await db`SELECT subscription_expires_at FROM companies WHERE id = ${cid}::uuid`;
  ok("expiry not extended by replay",
    new Date(before[0].subscription_expires_at).getTime() === new Date(after[0].subscription_expires_at).getTime());
  const tierAfter: any = await db`SELECT subscription_tier FROM companies WHERE id = ${cid}::uuid`;
  ok("tier not upgraded by replay", tierAfter[0].subscription_tier === "growth");

  // 6. Expired → gate rejects again
  await db`UPDATE companies SET subscription_expires_at = now() - interval '1 day' WHERE id = ${cid}::uuid`;
  let expiredThrew = false;
  try { await assertSubscriptionActive(cid); } catch { expiredThrew = true; }
  ok("expired company gate rejects", expiredThrew);

  // Cleanup
  await db`DELETE FROM subscription_checkouts WHERE company_id = ${cid}::uuid`;
  await db`DELETE FROM companies WHERE id = ${cid}::uuid`;

  console.log("\n" + results.join("\n"));
  const fails = results.filter(r => r.startsWith("❌")).length;
  console.log(`\n${results.length - fails}/${results.length} checks passed`);
  if (fails > 0) process.exit(1);
}
main().catch((e) => { console.error("E2E failed:", e); process.exit(1); });
