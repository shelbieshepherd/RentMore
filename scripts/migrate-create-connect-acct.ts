// Migration tooling: create Fresh New Co's Stripe Connect account on the CURRENT
// platform (must be the platform's TEST key), mirroring the app's server fn
// (src/lib/db-queries.ts createConnectAccount). Uses the app's own lib functions
// so the account is created exactly as the product would.
//
// Run:  source /etc/profile.d/cto-env-vars.sh && STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" DATABASE_URL="$DATABASE_URL" bun run scripts/migrate-create-connect-acct.ts
// (bun auto-loads .env; if DATABASE_URL is already in .env you can skip it.)
import { createConnectAccount, getOnboardingLink, RENTMORE_SITE_URL } from "../src/lib/stripe";
import { sql } from "../src/db";

const CONNECT_CO = "c0f28972-0029-4a6c-979a-fe14cc7bb213"; // Fresh New Co

const key = process.env.STRIPE_SECRET_KEY || "";
if (!key.startsWith("sk_test_")) {
  console.error("STRIPE_SECRET_KEY missing or not a TEST key — aborting. (Never create test accounts with live keys.)");
  process.exit(2);
}
const db = sql();

const coRows = (await db`SELECT id, name, stripe_connect_account_id FROM companies WHERE id = ${CONNECT_CO}::uuid LIMIT 1`) as any[];
const co = coRows[0];
if (!co) { console.error("Fresh New Co not found"); process.exit(1); }
if (co.stripe_connect_account_id) {
  console.error(`Fresh New Co already has connected account ${co.stripe_connect_account_id} — aborting (idempotency guard).`);
  process.exit(3);
}

const userRows = (await db`SELECT email FROM users WHERE company_id = ${CONNECT_CO}::uuid ORDER BY created_at LIMIT 1`) as any[];
const email = userRows[0]?.email || `owner+${CONNECT_CO.slice(0, 8)}@rentmorevrs.com`;

const acct = await createConnectAccount({ email, businessName: co.name });
console.log("CONNECTED_ACCT:", acct.id, "details_submitted:", acct.details_submitted, "charges_enabled:", acct.charges_enabled);

await db`UPDATE companies SET stripe_connect_account_id = ${acct.id} WHERE id = ${CONNECT_CO}::uuid`;

const link = await getOnboardingLink({
  accountId: acct.id,
  refreshUrl: `${RENTMORE_SITE_URL}/settings/payments`,
  returnUrl: `${RENTMORE_SITE_URL}/settings/payments?onboarded=1`,
});
console.log("ONBOARDING_URL:", link.url);
