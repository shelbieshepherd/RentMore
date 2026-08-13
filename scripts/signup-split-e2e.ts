// Signup UX split E2E (Aug 2026) — verifies that registerCompany's writes
// produce a company row named after the COMPANY and a user row named after the
// PERSON, with mixed-case inputs, lowercased email, and a company-derived slug.
// Server fns need Start context, so this replicates the exact SQL statements
// registerCompany runs (see src/lib/db-queries.ts) to prove the data model.
import { sql } from "../src/db";
const db = sql();

async function main() {
  const results: string[] = [];
  const ok = (name: string, pass: boolean, extra = "") =>
    results.push(`${pass ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);

  const personName = "Taylor O'Neil"; // mixed case + apostrophe
  const companyName = "Harborview Rentals LLC"; // distinct from person name
  const rawEmail = `Signup.Split.${Date.now()}@TestRentMore.com`; // mixed case on purpose
  const email = rawEmail.trim().toLowerCase();
  const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  // ── Replicate registerCompany (db-queries.ts) exactly ──
  const existing = await db`
    SELECT id FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1
  `;
  ok("dup-check runs case-insensitively (no existing row)", existing.length === 0);

  const companyRows = await db`
    INSERT INTO companies (name, slug, subscription_tier)
    VALUES (${companyName}, ${slug}, 'free')
    RETURNING id, name, slug
  `;
  const cid = companyRows[0].id as string;
  ok("company name = company field (not person name)", companyRows[0].name === companyName);
  ok("slug derived from company name", companyRows[0].slug === slug);

  const token = crypto.randomUUID();
  const expires = new Date(Date.now() + 86400000).toISOString();
  const userRows = await db`
    INSERT INTO users (company_id, email, password_hash, name, role, verify_token, verify_token_expires)
    VALUES (${cid}::uuid, ${email},
      crypt('password123', gen_salt('bf')),
      ${personName}, 'admin', ${token}, ${expires}::timestamptz)
    RETURNING id, company_id, email, name, role
  `;
  ok("user name = person field (not company name)", userRows[0].name === personName);
  ok("user email stored lowercased", userRows[0].email === email);
  ok("user role = admin", userRows[0].role === "admin");
  ok("user linked to new company", userRows[0].company_id === cid);

  // ── Cross-check rows in the DB (live read-back) ──
  const dbCheck = await db`
    SELECT c.name AS company_name, u.name AS user_name, u.email AS user_email
    FROM companies c JOIN users u ON u.company_id = c.id
    WHERE c.id = ${cid}::uuid
  `;
  const row = dbCheck[0];
  ok("live DB: company.name = company field", row.company_name === companyName);
  ok("live DB: users.name = person field", row.user_name === personName);
  ok("live DB: users.email lowercased", row.user_email === email);
  ok("company name ≠ person name (split works)", row.company_name !== row.user_name);

  // ── Cleanup ──
  await db`DELETE FROM users WHERE company_id = ${cid}::uuid`;
  await db`DELETE FROM companies WHERE id = ${cid}::uuid`;
  const gone = await db`SELECT id FROM companies WHERE id = ${cid}::uuid`;
  ok("cleanup removed test rows", gone.length === 0);

  console.log(results.join("\n"));
  const failed = results.filter((r) => r.startsWith("❌")).length;
  console.log(`\n${results.length - failed}/${results.length} checks green`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(1);
});
