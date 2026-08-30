// RentVue — Database query layer (Neon Postgres via TanStack Start server functions)
// All DB access goes through createServerFn handlers; never call sql() directly from client code.
import { createServerFn } from "@tanstack/react-start";
import { sql } from "~/db";
import { requireCompanyAuth, assertCompanyOwner, resolveAuthCompany, DEMO_COMPANY_ID } from "./server-auth";
import { randomBytes } from "node:crypto";
import { guestTotalCents, pmNetCents, stripeFeeCents } from "./fees";
import {
  calculateOwnerPayouts,
  type PayoutOwner,
  type PayoutProperty,
  type PayoutPayment,
  type PayoutMaintenance,
} from "./payouts";

export const DEFAULT_COMPANY_ID = "00000000-0000-0000-0000-000000000001";
const SITE_BASE = "https://www.rentmorevrs.com";

// Convert Neon row to JSON-safe plain object (Date → ISO string)
function jsonSafe(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) out[k] = v.toISOString();
    else out[k] = v;
  }
  return out;
}

// ── Auth ──
export const authenticateUser = createServerFn()
  .validator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      SELECT id, company_id, email, name, role, email_verified
      FROM users
      WHERE LOWER(email) = LOWER(${data.email}) AND password_hash = crypt(${data.password}, password_hash)
      LIMIT 1
    `;
    return rows[0] || null;
  });

export const fetchUserById = createServerFn()
  .validator((data: { id: string }) => data)
  .handler(async ({ data, request }) => {
    // SECURITY: a caller may only read a user whose company they belong to
    // (covers the session-restore self-lookup and same-company teammate lookups).
    await assertCompanyOwner(request, await (async () => {
      const r = await sql()`SELECT company_id FROM users WHERE id = ${data.id}::uuid LIMIT 1`;
      return r.length ? String(r[0].company_id) : null;
    })());
    const rows = await sql()`
      SELECT id, company_id, email, name, role, email_verified
      FROM users WHERE id = ${data.id}::uuid
      LIMIT 1
    `;
    return rows[0] || null;
  });

export const fetchUsersByCompany = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      SELECT id, company_id, email, name, role
      FROM users WHERE company_id = ${data.companyId}::uuid
      ORDER BY created_at
    `;
    return rows.map(jsonSafe);
  });

// Plan management
export const fetchCompanyPlan = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      SELECT subscription_tier FROM companies WHERE id = ${data.companyId}::uuid LIMIT 1
    `;
    return rows[0]?.subscription_tier || null;
  });

export const updateCompanySubscription = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; subscriptionTier: string }) => data)
  .handler(async ({ data }) => {
    await sql()`
      UPDATE companies SET subscription_tier = ${data.subscriptionTier}
      WHERE id = ${data.companyId}::uuid
    `;
    return { success: true };
  });
// ── Subscription paywall ──
const PAID_TIERS = new Set(["starter", "growth", "pro", "enterprise"]);
// Active = demo company (exempt) OR paid tier (starter/growth/pro/enterprise,
// not a "_pending" marker) with a non-expired subscription_expires_at.
export const fetchSubscriptionStatus = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    if (data.companyId === DEFAULT_COMPANY_ID) {
      return { tier: "demo", expiresAt: null, active: true, isDemo: true };
    }
    const rows = await sql()`
      SELECT subscription_tier, subscription_expires_at
      FROM companies WHERE id = ${data.companyId}::uuid LIMIT 1
    `;
    if (!rows.length) throw new Error("Company not found");
    const tier: string | null = rows[0].subscription_tier || null;
    const expiresAt: Date | null = rows[0].subscription_expires_at
      ? new Date(rows[0].subscription_expires_at)
      : null;
    const paid = !!tier && PAID_TIERS.has(tier);
    const active = paid && !!expiresAt && expiresAt.getTime() > Date.now();
    return {
      tier,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      active,
      isDemo: false,
    };
  });
// Trusted success-return marking: records a Stripe Checkout session id
// idempotently (UNIQUE session_id) and marks the company paid for 30 days.
// v1 verification model: no managed-account API keys — the owner reconciles
// in their Stripe dashboard; this fn is also the manual reconcile path
// (call it with a known-good session id to flip a company to paid).
export const markCompanyPaid = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; tier: string; sessionId: string }) => data)
  .handler(async ({ data }) => {
    if (data.companyId === DEFAULT_COMPANY_ID) {
      return { success: true, alreadyMarked: false, demo: true };
    }
    const tier = data.tier.toLowerCase();
    if (!PAID_TIERS.has(tier)) throw new Error("Invalid tier: " + data.tier);
    // Idempotency: same session id never double-marks (also blocks replay).
    const existing = await sql()`
      SELECT company_id, tier FROM subscription_checkouts
      WHERE session_id = ${data.sessionId} LIMIT 1
    `;
    if (existing.length > 0) {
      return { success: true, alreadyMarked: true, tier: existing[0].tier };
    }
    const expiresAt = new Date(Date.now() + 30 * 86400000);
    await sql().transaction((tx) => [
      tx`
        UPDATE companies
        SET subscription_tier = ${tier},
            subscription_expires_at = ${expiresAt.toISOString()}::timestamptz
        WHERE id = ${data.companyId}::uuid
      `,
      tx`
        INSERT INTO subscription_checkouts (session_id, company_id, tier)
        VALUES (${data.sessionId}, ${data.companyId}::uuid, ${tier})
      `,
    ]);
    return { success: true, alreadyMarked: false, tier, expiresAt: expiresAt.toISOString() };
  });
// Hard server-side gate for the paywall. Demo exempt; throws a friendly error
// the UI surfaces ("Your plan is inactive — renew to keep using RentMore").
// Exported (plain fn, no Start context) so tests/E2E can call it directly.
export async function assertSubscriptionActive(companyId: string): Promise<void> {
  if (companyId === DEFAULT_COMPANY_ID) return;
  const rows = await sql()`
    SELECT subscription_tier, subscription_expires_at
    FROM companies WHERE id = ${companyId}::uuid LIMIT 1
  `;
  const tier: string | null = rows[0]?.subscription_tier || null;
  const expiresAt: Date | null = rows[0]?.subscription_expires_at
    ? new Date(rows[0].subscription_expires_at)
    : null;
  const paid = !!tier && PAID_TIERS.has(tier);
  const active = paid && !!expiresAt && expiresAt.getTime() > Date.now();
  if (!active) {
    throw new Error("Your plan is inactive — renew to keep using RentMore");
  }
}

export const registerCompany = createServerFn()
  .validator((data: { name: string; companyName: string; email: string; password: string }) => data)
  .handler(async ({ data }) => {
    // Normalize email to lowercase so login is case-insensitive end-to-end.
    const email = data.email.trim().toLowerCase();
    // Check duplicate email first (case-insensitive)
    const existing = await sql()`
      SELECT id FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1
    `;
    if (existing.length > 0) {
      throw new Error("EMAIL_TAKEN");
    }
    // Create company — new signups land unpaid ('free', no expiry) until they
    // purchase a plan through the /plan page (hard paywall, no free trial).
    const slug = data.companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const companyRows = await sql()`
      INSERT INTO companies (name, slug, subscription_tier)
      VALUES (${data.companyName}, ${slug}, 'free')
      RETURNING id
    `;
    const companyId = companyRows[0].id;
    // Generate verification token (24h expiry)
    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 86400000).toISOString();
    // Create admin user with bcrypt hash + verification token
    const userRows = await sql()`
      INSERT INTO users (company_id, email, password_hash, name, role, verify_token, verify_token_expires)
      VALUES (${companyId}::uuid, ${email},
        crypt(${data.password}, gen_salt('bf')),
        ${data.name}, 'admin', ${token}, ${expires}::timestamptz)
      RETURNING id, company_id, email, name, role
    `;
    return { ...userRows[0], verifyToken: token };
  });

// ── Shared email sender (Resend when key is set, file-queue fallback for local dev) ──

async function sendViaResendOrQueue(entry: { to: string; toName: string; subject: string; html: string }): Promise<{ success: boolean; error?: string }> {
  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "RentMore <noreply@rentmorevrs.com>",
          to: [entry.to],
          subject: entry.subject,
          html: entry.html,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { success: false, error: `Resend HTTP ${res.status}: ${body}` };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Resend fetch failed" };
    }
  }
  // File-queue fallback (local dev / no API key)
  try {
    const fs = require("fs");
    const queuePath = "/home/team/shared/email-queue/email-queue.jsonl";
    const line = JSON.stringify({
      id: `email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      queuedAt: new Date().toISOString(),
      ...entry,
    }) + "\n";
    fs.appendFileSync(queuePath, line);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Queue write failed" };
  }
}

export const sendEmail = createServerFn()
  .validator((data: { to: string; toName: string; subject: string; html: string }) => data)
  .handler(async ({ data }) => sendViaResendOrQueue(data));

export const queueVerificationEmail = createServerFn()
  .validator((data: { email: string; token: string }) => data)
  .handler(async ({ data }) => {
    const baseUrl = "https://rentmorevrs.com";
    const verifyLink = `${baseUrl}/verify?token=${encodeURIComponent(data.token)}`;
    return sendViaResendOrQueue({
      to: data.email,
      toName: "",
      subject: "Verify your RentMore account",
      html: `<p>Welcome to RentMore!</p><p>Please verify your email address by clicking the link below:</p><p><a href="${verifyLink}">${verifyLink}</a></p><p>This link expires in 24 hours.</p><p>If you didn't create a RentMore account, you can ignore this email.</p>`,
    });
  });

export const insertUser = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; email: string; password: string; name: string; role: string }) => data)
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const existing = await sql()`
      SELECT id FROM users WHERE company_id = ${data.companyId}::uuid AND LOWER(email) = LOWER(${email}) LIMIT 1
    `;
    if (existing.length > 0) {
      throw new Error("EMAIL_TAKEN");
    }
    const rows = await sql()`
      INSERT INTO users (company_id, email, password_hash, name, role)
      VALUES (${data.companyId}::uuid, ${email},
        crypt(${data.password}, gen_salt('bf')),
        ${data.name}, ${data.role})
      RETURNING id, company_id, email, name, role
    `;
    // Auto-send a welcome email when an admin adds a user. AWAITED inside
    // try/catch so the email completes before this server fn returns: on
    // serverless (Vercel) an un-awaited background promise is killed when the
    // response is sent, which dropped the welcome email for real users
    // (e.g. shepherdrepair@gmail.com, Aug 11). Email failure still can't fail
    // user creation — the try/catch swallows it and adds only ~200-500ms.
    // Uses the Resend/queue helper directly, NOT the sendEmail server fn
    // (server-fn-inside-server-fn hazard). Never includes the password — the new
    // user logs in with credentials their admin sets up; this email only tells
    // them the account exists and how to log in.
    try {
      const companyRows = await sql()`
        SELECT name FROM companies WHERE id = ${data.companyId}::uuid LIMIT 1
      `;
      const companyName = companyRows[0]?.name || "your company";
      const roleLabel = data.role.charAt(0).toUpperCase() + data.role.slice(1);
      await sendViaResendOrQueue({
        to: data.email,
        toName: data.name,
        subject: `You've been added to ${companyName} as ${roleLabel}`,
        html: `<p>Hi ${data.name},</p><p>You've been added to <strong>${companyName}</strong> on RentMore as <strong>${roleLabel}</strong>.</p><p>Log in at <a href="https://rentmorevrs.com/login">https://rentmorevrs.com/login</a> to get started.</p><p>— The RentMore team</p>`,
      });
    } catch { /* email is best-effort only */ }
    return rows[0];
  });
export const updateUser = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: {
    companyId: string; id: string;
    name?: string; email?: string; role?: string; password?: string;
  }) => data)
  .handler(async ({ data }) => {
    if (data.email) {
      const email = data.email.trim().toLowerCase();
      const dup = await sql()`
        SELECT id FROM users
        WHERE company_id = ${data.companyId}::uuid AND LOWER(email) = LOWER(${email}) AND id <> ${data.id}::uuid
        LIMIT 1
      `;
      if (dup.length > 0) throw new Error("EMAIL_TAKEN");
      data.email = email;
    }
    const rows = await sql()`
      UPDATE users SET
        name = COALESCE(${data.name ?? null}, name),
        email = COALESCE(${data.email ?? null}, email),
        role = COALESCE(${data.role ?? null}, role),
        password_hash = CASE
          WHEN ${data.password ?? null} IS NOT NULL THEN crypt(${data.password ?? ""}, gen_salt('bf'))
          ELSE password_hash
        END
      WHERE id = ${data.id}::uuid AND company_id = ${data.companyId}::uuid
      RETURNING id, company_id, email, name, role
    `;
    if (rows.length === 0) throw new Error("USER_NOT_FOUND");
    return rows[0];
  });
export const deleteUser = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; id: string }) => data)
  .handler(async ({ data }) => {
    // Hard delete: no FK constraints reference users (verified in schema.sql —
    // maintenance/leads don't FK to users), so a physical delete is safe.
    // Scoped to company_id so one tenant can never delete another's users.
    const rows = await sql()`
      DELETE FROM users WHERE id = ${data.id}::uuid AND company_id = ${data.companyId}::uuid
      RETURNING id
    `;
    if (rows.length === 0) throw new Error("USER_NOT_FOUND");
    return { success: true };
  });

// ── Email Verification ──
export const verifyEmail = createServerFn()
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      SELECT id, email, verify_token_expires FROM users
      WHERE verify_token = ${data.token} LIMIT 1
    `;
    if (rows.length === 0) return { valid: false, error: "Invalid or expired verification link." };
    const user = rows[0];
    if (new Date(user.verify_token_expires) < new Date()) {
      return { valid: false, error: "Verification link has expired." };
    }
    await sql()`
      UPDATE users SET email_verified = true, verify_token = NULL, verify_token_expires = NULL
      WHERE id = ${user.id}::uuid
    `;
    return { valid: true, email: user.email };
  });

export const regenerateVerifyToken = createServerFn()
  .validator((data: { email: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      SELECT id, email_verified FROM users WHERE email = ${data.email} LIMIT 1
    `;
    if (rows.length === 0) return { success: false, error: "No account found with that email." };
    if (rows[0].email_verified) return { success: false, error: "Email already verified." };
    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 86400000).toISOString();
    await sql()`
      UPDATE users SET verify_token = ${token}, verify_token_expires = ${expires}::timestamptz
      WHERE id = ${rows[0].id}::uuid
    `;
    return { success: true, token };
  });
// ── Password Reset ──
export const requestPasswordReset = createServerFn()
  .validator((data: { email: string }) => data)
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const rows = await sql()`
      SELECT id, email FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1
    `;
    // Always respond success — no account enumeration. Only users that exist
    // actually get an email.
    if (rows.length === 0) return { success: true };
    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3600000).toISOString(); // 1 hour
    await sql()`
      UPDATE users SET password_reset_token = ${token}, password_reset_expires = ${expires}::timestamptz
      WHERE id = ${rows[0].id}::uuid
    `;
    const resetLink = `${SITE_BASE}/reset-password?token=${encodeURIComponent(token)}`;
    await sendViaResendOrQueue({
      to: rows[0].email,
      toName: "",
      subject: "Reset your RentMore password",
      html: `<p>Hi there,</p><p>We received a request to reset your RentMore password. Click the link below to choose a new one:</p><p><a href="${resetLink}">${resetLink}</a></p><p>This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p><p>— The RentMore team</p>`,
    });
    return { success: true };
  });
export const resetPassword = createServerFn()
  .validator((data: { token: string; password: string }) => data)
  .handler(async ({ data }) => {
    if (!data.password || data.password.length < 8) {
      return { success: false, error: "Password must be at least 8 characters." };
    }
    const rows = await sql()`
      SELECT id, password_reset_expires FROM users
      WHERE password_reset_token = ${data.token} LIMIT 1
    `;
    if (rows.length === 0) {
      return { success: false, error: "Invalid or expired reset link. Please request a new one." };
    }
    const user = rows[0];
    if (!user.password_reset_expires || new Date(user.password_reset_expires) < new Date()) {
      await sql()`
        UPDATE users SET password_reset_token = NULL, password_reset_expires = NULL
        WHERE id = ${user.id}::uuid
      `;
      return { success: false, error: "This reset link has expired. Please request a new one." };
    }
    await sql()`
      UPDATE users SET password_hash = crypt(${data.password}, gen_salt('bf')),
        password_reset_token = NULL, password_reset_expires = NULL
      WHERE id = ${user.id}::uuid
    `;
    return { success: true };
  });

// ── Properties ──
export const fetchProperties = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      SELECT id, company_id, owner_id, name, address, property_type, beds, bed_config, baths,
             nightly_rate, monthly_rent, status, image_url, created_at,
             cancellation_policy, check_in_time, check_out_time, house_rules,
             min_stay, max_stay, pet_policy, property_subtype
      FROM properties WHERE company_id = ${data.companyId}::uuid
    `;
    return rows.map(jsonSafe);
  });

export const insertProperty = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: {
    companyId: string; name: string; address: string; type: string;
    monthlyRent: number; deposit: number; status: string; ownerId: string;
    nightlyRate?: number; beds?: number; baths?: number; imageUrl?: string;
    cancellationPolicy?: string; checkInTime?: string; checkOutTime?: string;
    houseRules?: string[]; minStay?: number; maxStay?: number;
    bedConfig?: { type: string; count: number }[];
    petPolicy?: string; propertySubtype?: string;
  }) => data)
  .handler(async ({ data }) => {
    await assertSubscriptionActive(data.companyId);
    const rows = await sql()`
      INSERT INTO properties (company_id, owner_id, name, address, property_type,
        monthly_rent, status, nightly_rate, beds, bed_config, baths, image_url,
        cancellation_policy, check_in_time, check_out_time, house_rules,
        min_stay, max_stay, pet_policy, property_subtype)
      VALUES (${data.companyId}::uuid, ${uuidOrNull(data.ownerId)}::uuid, ${data.name}, ${data.address},
        ${data.type === "short-term" ? "short_term" : "long_term"},
        ${data.monthlyRent}, ${data.status === "vacant" ? "active" : "active"},
        ${data.nightlyRate || null}, ${data.beds || null},
        ${data.bedConfig ? JSON.stringify(data.bedConfig) : null},
        ${data.baths || null},
        ${data.imageUrl || null},
        ${data.cancellationPolicy || null}, ${data.checkInTime || null},
        ${data.checkOutTime || null},
        ${data.houseRules ? JSON.stringify(data.houseRules) : null},
        ${data.minStay || null}, ${data.maxStay || null},
        ${data.petPolicy || null}, ${data.propertySubtype || null})
      RETURNING id
    `;
    return rows[0];
  });

// ── Bookings ──
export const fetchBookings = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      SELECT id, company_id, property_id, guest_name, guest_email, guest_phone,
             guest_address, start_date, end_date, nightly_rate, status, total_amount,
             source, reservation_number, commission_rate, created_at, created_by,
             cleaning_fee, linen_fee, tax_amount
      FROM bookings WHERE company_id = ${data.companyId}::uuid
      ORDER BY start_date DESC
    `;
    return rows.map(jsonSafe);
  });

export const insertBooking = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; propertyId: string; guestName: string; guestEmail: string; guestPhone?: string; guestAddress?: string; startDate: string; endDate: string; nightlyRate: number; status: string; totalAmount: number; source: string; commissionRate: number; createdBy: string; cleaningFee?: number; linenFee?: number; taxAmount?: number }) => data)
  .handler(async ({ data }) => {
    await assertSubscriptionActive(data.companyId);
    // 4-digit booking number, unique within the company (owner direction 2026-08-21).
    // Retry on collision; fall back to last-4-of-timestamp if exhausted.
    let rn = "";
    for (let attempt = 0; attempt < 20; attempt++) {
      const cand = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
      const clash = await sql()`SELECT 1 FROM bookings WHERE company_id = ${data.companyId}::uuid AND reservation_number = ${cand} LIMIT 1`;
      if (!clash.length) { rn = cand; break; }
    }
    if (!rn) rn = String(Date.now()).slice(-4);
    const rows = await sql()`
      INSERT INTO bookings (company_id, property_id, guest_name, guest_email, guest_phone, guest_address, start_date, end_date, nightly_rate, status, total_amount, source, reservation_number, commission_rate, created_by, cleaning_fee, linen_fee, tax_amount)
      VALUES (${data.companyId}::uuid, ${data.propertyId}::uuid, ${data.guestName}, ${data.guestEmail}, ${data.guestPhone || null}, ${data.guestAddress || null}, ${data.startDate}::date, ${data.endDate}::date, ${data.nightlyRate}, ${data.status}, ${data.totalAmount}, ${data.source}, ${rn}, ${data.commissionRate}, ${data.createdBy}, ${data.cleaningFee ?? null}, ${data.linenFee ?? null}, ${data.taxAmount ?? null})
      RETURNING id
    `;
    return rows[0];
  });

export const updateBookingDB = createServerFn()
  .validator((data: { bookingId: string; updates: Record<string, unknown> }) => data)
  .handler(async ({ data, request }) => {
    // SECURITY: only the company that owns the booking may update it.
    await assertCompanyOwner(request as Request | undefined, await (async () => {
      const r = await sql()`SELECT company_id FROM bookings WHERE id = ${data.bookingId}::uuid LIMIT 1`;
      return r.length ? String(r[0].company_id) : null;
    })());
    const { bookingId, updates } = data;
    if (!Object.keys(updates).length) return;
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(updates)) {
      const col = camelToSnake(k);
      sets.push(`${col} = $${i++}`);
      vals.push(v);
    }
    vals.push(bookingId);
    await sql().query(
      `UPDATE bookings SET ${sets.join(", ")} WHERE id = $${i}::uuid`,
      vals
    );
  });

// ── Tenants ──
export const fetchTenants = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      SELECT id, company_id, property_id, name, email, phone, address,
             lease_start, lease_end, monthly_rent, security_deposit, status, created_at
      FROM tenants WHERE company_id = ${data.companyId}::uuid
      ORDER BY lease_start DESC
    `;
    return rows.map(jsonSafe);
  });

export const insertTenant = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; propertyId: string; name: string; email: string; phone: string; address?: string; leaseStart: string; leaseEnd: string; monthlyRent: number; deposit: number }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      INSERT INTO tenants (company_id, property_id, name, email, phone, address, lease_start, lease_end, monthly_rent, security_deposit, status)
      VALUES (${data.companyId}::uuid, ${data.propertyId}::uuid, ${data.name}, ${data.email}, ${data.phone}, ${data.address || null}, ${data.leaseStart}::date, ${data.leaseEnd}::date, ${data.monthlyRent}, ${data.deposit}, 'active')
      RETURNING id
    `;
    return rows[0];
  });

// ── Payments ──
export const fetchPayments = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      SELECT id, company_id, booking_id, tenant_id, property_id, owner_id, payment_type, method,
             amount_cents, description, status, check_number, created_at, processing_fee_cents, dispute_status
      FROM payments WHERE company_id = ${data.companyId}::uuid
      ORDER BY created_at DESC
    `;
    return rows.map(jsonSafe);
  });

export const insertPayment = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; bookingId?: string; tenantId?: string; propertyId: string; paymentType: string; method: string; amountCents: number; description: string; status: string; ownerId?: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      INSERT INTO payments (company_id, booking_id, tenant_id, property_id, owner_id, payment_type, method, amount_cents, description, status)
      VALUES (${data.companyId}::uuid, ${uuidOrNull(data.bookingId)}::uuid, ${uuidOrNull(data.tenantId)}::uuid, ${data.propertyId}::uuid, ${uuidOrNull(data.ownerId)}::uuid, ${data.paymentType}, ${data.method}, ${data.amountCents}, ${data.description}, ${data.status})
      RETURNING id
    `;
    return rows[0];
  });

// ── Owner payouts — hybrid v1: DB-backed lifecycle (calculated → pending → paid) ──
// The PM moves the money from their own bank (ACH export file / paper check);
// RentMore persists the math + status and records the disbursement as a
// payment_type 'payout' payments row so reporting reconciles. Never any
// automated Stripe transfers in v1.

// Shared: compute per-owner/per-property statements from DB rows (cents).
async function computePayoutStatements(companyId: string, periodStart: string, periodEnd: string) {
  const [ownerRows, propRows, payRows, maintRows] = await Promise.all([
    sql()`SELECT id, name, routing_number, account_number, payout_method FROM owners WHERE company_id = ${companyId}::uuid`,
    sql()`SELECT id, owner_id, name FROM properties WHERE company_id = ${companyId}::uuid`,
    sql()`SELECT id, property_id, amount_cents, description, status, created_at FROM payments WHERE company_id = ${companyId}::uuid AND payment_type IN ('charge','deposit')`,
    sql()`SELECT id, property_id, description, priority, status, created_at, updated_at FROM maintenance_requests WHERE company_id = ${companyId}::uuid`,
  ]);
  const owners: PayoutOwner[] = ownerRows.map((r) => ({ id: r.id, name: r.name }));
  const properties: PayoutProperty[] = propRows.map((r) => ({ id: r.id, ownerId: r.owner_id || "", name: r.name }));
  const payments: PayoutPayment[] = payRows.map((r) => ({
    id: r.id,
    propertyId: r.property_id,
    status: r.status === "completed" ? "paid" : r.status,
    date: dbDateStr(r.created_at),
    description: r.description || "Payment",
    amount: Number(r.amount_cents) || 0,
  }));
  const maintenance: PayoutMaintenance[] = maintRows.map((r) => ({
    id: r.id,
    propertyId: r.property_id,
    status: r.status === "completed" ? "resolved" : r.status,
    dateReported: dbDateStr(r.created_at),
    dateResolved: r.status === "completed" ? dbDateStr(r.updated_at) : undefined,
    description: r.description,
    priority: r.priority,
  }));
  const statements = calculateOwnerPayouts(owners, properties, payments, maintenance, periodStart, periodEnd);
  return statements.map((s) => {
    const owner = ownerRows.find((o) => o.id === s.ownerId);
    return {
      ownerId: s.ownerId,
      ownerName: s.ownerName,
      propertyId: s.propertyId,
      periodStart,
      periodEnd,
      grossCents: Math.round(s.grossRevenue * 100),
      managementFeeCents: Math.round(s.managementFee * 100),
      maintenanceDeductionsCents: Math.round(s.maintenanceDeductions * 100),
      netCents: Math.round(s.netPayout * 100),
      method: owner?.payout_method === "check" ? "check" : "ach",
    };
  });
}

// Persist a computed batch: replaces previous calculated/pending rows for the
// company+period (paid rows are kept — they're part of the books).
export const generatePayoutStatements = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; periodStart: string; periodEnd: string }) => data)
  .handler(async ({ data }) => {
    const statements = await computePayoutStatements(data.companyId, data.periodStart, data.periodEnd);
    await sql()`
      DELETE FROM payouts
      WHERE company_id = ${data.companyId}::uuid
        AND period_start = ${data.periodStart}::date
        AND period_end = ${data.periodEnd}::date
        AND status IN ('calculated','pending')`;
    for (const s of statements) {
      await sql()`
        INSERT INTO payouts (company_id, owner_id, property_id, period_start, period_end,
                             gross_cents, management_fee_cents, maintenance_deductions_cents,
                             net_cents, status, method)
        VALUES (${data.companyId}::uuid, ${s.ownerId}::uuid, ${s.propertyId}::uuid,
                ${s.periodStart}::date, ${s.periodEnd}::date,
                ${s.grossCents}, ${s.managementFeeCents}, ${s.maintenanceDeductionsCents},
                ${s.netCents}, 'calculated', ${s.method})`;
    }
    return statements;
  });

export const fetchPayouts = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      SELECT p.id, p.owner_id, o.name AS owner_name, p.property_id, p.period_start, p.period_end,
             p.gross_cents, p.management_fee_cents, p.maintenance_deductions_cents, p.net_cents,
             p.status, p.method, p.paid_at, p.created_at
      FROM payouts p
      LEFT JOIN owners o ON o.id = p.owner_id
      WHERE p.company_id = ${data.companyId}::uuid
      ORDER BY p.created_at DESC`;
    return rows.map(jsonSafe);
  });

export const updatePayoutStatusDB = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; payoutId: string; status: "calculated" | "pending" }) => data)
  .handler(async ({ data }) => {
    await sql()`
      UPDATE payouts SET status = ${data.status}
      WHERE id = ${data.payoutId}::uuid AND company_id = ${data.companyId}::uuid`;
    return { ok: true };
  });

// Mark a payout disbursed: status → paid + insert the reconciling payments row.
// Neon v1 transactions take a sync callback returning an array of queries, all
// executed in one transaction — the INSERT pulls from the payouts row (guarded
// by status <> 'paid') so it's atomic and idempotent without cross-query values.
export const recordPayoutPaid = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; payoutId: string }) => data)
  .handler(async ({ data }) => {
    const [rows, paymentRows, _updated] = await sql().transaction((tx) => [
      tx`
        SELECT owner_id, property_id, net_cents, method, period_start, period_end, status
        FROM payouts WHERE id = ${data.payoutId}::uuid AND company_id = ${data.companyId}::uuid`,
      tx`
        INSERT INTO payments (company_id, owner_id, property_id, payment_type, method, amount_cents, description, status)
        SELECT company_id, owner_id, property_id, 'payout', method, net_cents,
               'Owner payout — ' || period_start::text || ' to ' || period_end::text, 'completed'
        FROM payouts
        WHERE id = ${data.payoutId}::uuid AND company_id = ${data.companyId}::uuid AND status <> 'paid'
        RETURNING id, created_at`,
      tx`
        UPDATE payouts SET status = 'paid', paid_at = NOW()
        WHERE id = ${data.payoutId}::uuid AND company_id = ${data.companyId}::uuid AND status <> 'paid'`,
    ]);
    const p = rows[0];
    if (!p) throw new Error("Payout not found");
    if (!paymentRows.length) return { alreadyPaid: true }; // idempotent — no-op on a paid payout
    return {
      payoutId: data.payoutId,
      paymentId: paymentRows[0].id,
      createdAt: paymentRows[0].created_at,
      ownerId: p.owner_id,
      propertyId: p.property_id ?? "",
      amountCents: Number(p.net_cents),
      method: p.method,
      periodStart: dbDateStr(p.period_start),
      periodEnd: dbDateStr(p.period_end),
    };
  });

// ── Stripe Connect (Option A — separate charges, RentMore never merchant of record) ──
// Demo company stays on the mock path: never touches the real Stripe API.

export const createConnectAccount = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    if (data.companyId === DEFAULT_COMPANY_ID) {
      return { accountId: "acct_demo_mock", onboardingUrl: null, mock: true };
    }
    const companyRows = await sql()`
      SELECT id, name, stripe_connect_account_id
      FROM companies WHERE id = ${data.companyId}::uuid LIMIT 1`;
    if (!companyRows.length) throw new Error("Company not found");
    const { getOnboardingLink, createConnectAccount: createAcct } = await import("~/lib/stripe");
    const refresh = `${SITE_BASE}/settings/payments`;
    const ret = `${SITE_BASE}/settings/payments?onboarded=1`;
    const existing = companyRows[0].stripe_connect_account_id;
    if (existing) {
      // Account exists but onboarding incomplete — hand back a resume link.
      const link = await getOnboardingLink({ accountId: existing, refreshUrl: refresh, returnUrl: ret });
      return { accountId: existing, onboardingUrl: link.url };
    }
    const userRows = await sql()`
      SELECT email FROM users WHERE company_id = ${data.companyId}::uuid ORDER BY created_at LIMIT 1`;
    const email = userRows[0]?.email || `owner+${data.companyId.slice(0, 8)}@rentmorevrs.com`;
    const acct = await createAcct({ email, businessName: companyRows[0].name });
    await sql()`
      UPDATE companies SET stripe_connect_account_id = ${acct.id} WHERE id = ${data.companyId}::uuid`;
    const link = await getOnboardingLink({ accountId: acct.id, refreshUrl: refresh, returnUrl: ret });
    return { accountId: acct.id, onboardingUrl: link.url };
  });

export const getOnboardingLink = createServerFn()
  .validator((data: { accountId: string }) => data)
  .handler(async ({ data, request }) => {
    // SECURITY: only the company that owns the connect account may fetch its
    // onboarding link (demo mock only for demo-company users).
    if (data.accountId === "acct_demo_mock") {
      const auth = await resolveAuthCompany(request as Request | undefined);
      if (!auth || auth.companyId !== DEMO_COMPANY_ID) throw new Error("Forbidden");
      return { url: null, mock: true };
    }
    await assertCompanyOwner(request as Request | undefined, await (async () => {
      const r = await sql()`SELECT id FROM companies WHERE stripe_connect_account_id = ${data.accountId} LIMIT 1`;
      return r.length ? String(r[0].id) : null;
    })());
    const { getOnboardingLink: makeLink } = await import("~/lib/stripe");
    const link = await makeLink({
      accountId: data.accountId,
      refreshUrl: `${SITE_BASE}/settings/payments`,
      returnUrl: `${SITE_BASE}/settings/payments?onboarded=1`,
    });
    return { url: link.url };
  });

export const setConnectOnboardingComplete = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    if (data.companyId === DEFAULT_COMPANY_ID) return { success: true };
    const rows = await sql()`
      SELECT stripe_connect_account_id FROM companies WHERE id = ${data.companyId}::uuid LIMIT 1`;
    const acctId = rows[0]?.stripe_connect_account_id;
    if (!acctId) return { success: false, reason: "no_connect_account" };
    // Hardening: only mark onboarding complete if the connected account can
    // ACTUALLY charge cards — charges_enabled AND card_payments capability active.
    // The ?onboarded=1 return alone is a client-trusted signal; verify against
    // Stripe before flipping the flag so a non-chargeable account is never gated-in.
    const { getConnectReadiness } = await import("~/lib/stripe");
    let readiness: { ready: boolean };
    try {
      readiness = await getConnectReadiness(acctId);
    } catch (e: any) {
      return { success: false, reason: "retrieve_failed", message: e?.message };
    }
    if (!readiness.ready) {
      return { success: false, reason: "not_ready", accountId: acctId };
    }
    await sql()`
      UPDATE companies SET stripe_connect_onboarding_complete = true WHERE id = ${data.companyId}::uuid`;
    return { success: true, accountId: acctId };
  });

// fetchConnectStatus deliberately has NO auth middleware: it is called by the
// PUBLIC guest portal (anonymous guest) to determine whether online payment is
// available for a reservation. It only exposes a low-sensitivity onboarding
// flag, which the guest portal legitimately needs.
export const fetchConnectStatus = createServerFn()
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    if (data.companyId === DEFAULT_COMPANY_ID) {
      return { accountId: null, onboardingComplete: false, isDemo: true };
    }
    const rows = await sql()`
      SELECT stripe_connect_account_id, stripe_connect_onboarding_complete
      FROM companies WHERE id = ${data.companyId}::uuid LIMIT 1`;
    if (!rows.length) throw new Error("Company not found");
    return {
      accountId: rows[0].stripe_connect_account_id || null,
      onboardingComplete: !!rows[0].stripe_connect_onboarding_complete,
      isDemo: false,
    };
  });

export const createCheckoutSession = createServerFn()
  .validator((data: { companyId: string; amountCents: number; paymentType: string; bookingId?: string; propertyId?: string; method?: string }) => data)
  .handler(async ({ data }) => {
    const isAch = data.method === "ach";
    const method = isAch ? "ACH" : "credit card";
    // Guest-paid convenience fee model (owner decision Aug 13, FINAL): the
    // guest is charged booking + convenience fee (3.5% card); ACH is free for the guest —
    // after Stripe's cost the ENTIRE leftover goes to the PM. RentMore takes
    // ZERO transaction fee — no application_fee_amount is ever set.
    const guestTotal = guestTotalCents(data.amountCents, method);
    const pmNet = pmNetCents(data.amountCents, method);
    if (data.companyId === DEFAULT_COMPANY_ID) {
      return { url: null, sessionId: `cs_demo_${Date.now()}`, mock: true, guestTotalCents: guestTotal, pmNetCents: pmNet };
    }
    const companyRows = await sql()`
      SELECT stripe_connect_account_id, stripe_connect_onboarding_complete
      FROM companies WHERE id = ${data.companyId}::uuid LIMIT 1`;
    const company = companyRows[0];
    if (!company || !company.stripe_connect_account_id || !company.stripe_connect_onboarding_complete) {
      throw new Error("Online payments are not enabled for this company — complete Stripe onboarding first.");
    }
    const { stripe } = await import("~/lib/stripe");
    const productName =
      data.paymentType === "deposit" ? "RentMore booking deposit" :
      data.paymentType === "charge" ? "RentMore booking payment" :
      data.paymentType === "rent" ? "RentMore rent payment" :
      `RentMore ${data.paymentType} payment`;
    const successUrl = data.bookingId
      ? `${SITE_BASE}/guest/${data.bookingId}?checkout=success`
      : `${SITE_BASE}/payments?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = data.bookingId
      ? `${SITE_BASE}/guest/${data.bookingId}?checkout=cancelled`
      : `${SITE_BASE}/payments?checkout=cancelled`;
    // Attribution metadata: the Chunk D webhook uses this to reconcile the
    // payment_intent to a company/booking/property/payment-type/method row.
    const meta: Record<string, string> = {
      company_id: data.companyId,
      payment_type: data.paymentType,
      method: isAch ? "ach" : "card",
      booking_amount_cents: String(data.amountCents), // the booking itself
      pm_net_cents: String(pmNet), // what the PM receives (booking + leftover)
    };
    if (data.bookingId) meta.booking_id = data.bookingId;
    if (data.propertyId) meta.property_id = data.propertyId;
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          // Guest pays booking + convenience fee (3.5% card). ACH: free for the guest (PM absorbs).
          price_data: { currency: "usd", product_data: { name: productName }, unit_amount: guestTotal },
          quantity: 1,
        },
      ],
      metadata: meta,
      payment_intent_data: {
        // No application_fee_amount — RentMore takes zero transaction fee.
        on_behalf_of: company.stripe_connect_account_id, // customer = merchant of record
        metadata: meta,
      },
      payment_method_types: isAch ? ["us_bank_account"] : ["card"],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    return { url: session.url, sessionId: session.id, pmNetCents: pmNet };
  });

// Guest-portal booking lookup: resolves by reservation number OR booking UUID
// (email guest links use the booking id; guest links may also carry the
// reservation number). Returns the booking plus the property fields the guest
// portal renders (name/address/image/type/house rules/check-in-out).
export const fetchBookingByReservationNumber = createServerFn()
  .validator((data: { reservationNumber: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      SELECT b.id, b.company_id, b.property_id, b.guest_name, b.guest_email, b.guest_phone,
             b.guest_address, b.start_date, b.end_date, b.nightly_rate, b.status,
             b.total_amount, b.reservation_number, b.deposit_collected_cents, b.created_at,
             p.name AS property_name, p.address AS property_address,
             p.image_url AS property_image, p.property_type AS property_type,
             p.house_rules AS property_house_rules, p.check_in_time AS check_in_time,
             p.check_out_time AS check_out_time
      FROM bookings b
      JOIN properties p ON p.id = b.property_id
      WHERE b.reservation_number = ${data.reservationNumber} OR b.id::text = ${data.reservationNumber}
      LIMIT 1
    `;
    return rows[0] ? jsonSafe(rows[0]) : null;
  });

// ── Maintenance ──
export const fetchMaintenanceRequests = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      SELECT mr.id, mr.company_id, mr.property_id, mr.title, mr.description,
             mr.priority, mr.status, mr.vendor_id, mr.created_at, mr.updated_at
      FROM maintenance_requests mr WHERE mr.company_id = ${data.companyId}::uuid
      ORDER BY mr.created_at DESC
    `;
    return rows.map(jsonSafe);
  });

export const insertMaintenanceRequest = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; propertyId: string; title: string; description: string; priority: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      INSERT INTO maintenance_requests (company_id, property_id, title, description, priority, status)
      VALUES (${data.companyId}::uuid, ${data.propertyId}::uuid, ${data.title}, ${data.description}, ${data.priority}, 'open')
      RETURNING id
    `;
    return rows[0];
  });

// ── updateProperty (dynamic update) ──
export const updatePropertyDB = createServerFn()
  .validator((data: { propertyId: string; updates: Record<string, unknown> }) => data)
  .handler(async ({ data, request }) => {
    // SECURITY: only the company that owns the property may update it.
    await assertCompanyOwner(request as Request | undefined, await (async () => {
      const r = await sql()`SELECT company_id FROM properties WHERE id = ${data.propertyId}::uuid LIMIT 1`;
      return r.length ? String(r[0].company_id) : null;
    })());
    const { propertyId, updates } = data;
    if (!Object.keys(updates).length) return;
    const setClauses: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(updates)) {
      const col = camelToSnake(k);
      setClauses.push(`${col} = $${i++}`);
      vals.push(v);
    }
    vals.push(propertyId);
    await sql()`UPDATE properties SET `.append(
      sql().unsafe(`UPDATE properties SET ${setClauses.join(", ")} WHERE id = $${i}::uuid`, vals)
    );
  });

// ── updatePaymentStatus ──
export const updatePaymentStatusDB = createServerFn()
  .validator((data: { paymentId: string; status: string }) => data)
  .handler(async ({ data, request }) => {
    // SECURITY: only the company that owns the payment may update it.
    await assertCompanyOwner(request as Request | undefined, await (async () => {
      const r = await sql()`SELECT company_id FROM payments WHERE id = ${data.paymentId}::uuid LIMIT 1`;
      return r.length ? String(r[0].company_id) : null;
    })());
    await sql()`
      UPDATE payments SET status = ${data.status} WHERE id = ${data.paymentId}::uuid
    `;
  });

// ── updateMaintenanceRequest ──
export const updateMaintenanceRequestDB = createServerFn()
  .validator((data: { requestId: string; updates: Record<string, unknown> }) => data)
  .handler(async ({ data, request }) => {
    // SECURITY: only the company that owns the maintenance request may update it.
    await assertCompanyOwner(request as Request | undefined, await (async () => {
      const r = await sql()`SELECT company_id FROM maintenance_requests WHERE id = ${data.requestId}::uuid LIMIT 1`;
      return r.length ? String(r[0].company_id) : null;
    })());
    const { requestId, updates } = data;
    if (!Object.keys(updates).length) return;
    const setClauses: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(updates)) {
      const col = camelToSnake(k);
      setClauses.push(`${col} = $${i++}`);
      vals.push(v);
    }
    vals.push(requestId);
    await sql().query(
      `UPDATE maintenance_requests SET ${setClauses.join(", ")} WHERE id = $${i}::uuid`,
      vals
    );
  });

// ── Owners ──
export const fetchOwners = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      SELECT id, company_id, name, email, phone, stripe_connect_id, payout_schedule,
             bank_name, routing_number, account_number, payout_method, created_at
      FROM owners WHERE company_id = ${data.companyId}::uuid
    `;
    return rows.map(jsonSafe);
  });

export const insertOwner = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; name: string; id?: string; email?: string; phone?: string; bankName?: string; routingNumber?: string; accountNumber?: string; payoutMethod?: string }) => data)
  .handler(async ({ data }) => {
    // Optional client-provided id: the optimistic store entry and the DB row must
    // share one id, otherwise a property referencing this owner fails the FK
    // (properties_owner_id_fkey) — the historical cause of "property added but
    // never saved" when creating a new owner in the same form submission.
    const rows = await sql()`
      INSERT INTO owners (id, company_id, name, email, phone, bank_name, routing_number, account_number, payout_method)
      VALUES (${data.id ? data.id : null}::uuid, ${data.companyId}::uuid, ${data.name}, ${data.email || null}, ${data.phone || null},
        ${data.bankName || null}, ${data.routingNumber || null}, ${data.accountNumber || null},
        ${data.payoutMethod || "ach"})
      RETURNING id
    `;
    return rows[0];
  });

export const updateOwner = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; ownerId: string; updates: Record<string, unknown> }) => data)
  .handler(async ({ data }) => {
    const { ownerId, updates } = data;
    if (!Object.keys(updates).length) return;
    const setClauses: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    // Blank strings become NULL for these optional text columns (bank fields are
    // PM-provided data, not Stripe-linked — clearing them must be possible).
    const NULLABLE = new Set(["email", "phone", "bank_name", "routing_number", "account_number"]);
    for (const [k, v] of Object.entries(updates)) {
      const col = camelToSnake(k);
      setClauses.push(`${col} = $${i++}`);
      vals.push(NULLABLE.has(col) && (v === "" || v == null) ? null : v);
    }
    vals.push(ownerId, data.companyId);
    await sql().query(
      `UPDATE owners SET ${setClauses.join(", ")} WHERE id = ${i}::uuid AND company_id = ${i + 1}::uuid`,
      vals
    );
  });

export const deleteOwnerDB = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; ownerId: string }) => data)
  .handler(async ({ data }) => {
    // Financial integrity: an owner with recorded payout history cannot be
    // deleted — the statements are part of the company's books.
    const payoutRows = await sql()`
      SELECT 1 FROM payouts WHERE owner_id = ${data.ownerId}::uuid AND company_id = ${data.companyId}::uuid LIMIT 1`;
    const paymentRows = await sql()`
      SELECT 1 FROM payments WHERE owner_id = ${data.ownerId}::uuid AND company_id = ${data.companyId}::uuid LIMIT 1`;
    if (payoutRows.length || paymentRows.length) {
      throw new Error("This owner has recorded payouts and cannot be deleted. Keep the owner record for your books.");
    }
    // Unlink properties first (properties.owner_id FK has no ON DELETE CASCADE).
    await sql()`
      UPDATE properties SET owner_id = NULL
      WHERE owner_id = ${data.ownerId}::uuid AND company_id = ${data.companyId}::uuid`;
    await sql()`
      DELETE FROM owners WHERE id = ${data.ownerId}::uuid AND company_id = ${data.companyId}::uuid`;
    return { ok: true };
  });

// ── Owner payouts — hybrid v1: ACH-list CSV export (NO money movement) ──
// The PM uploads this file to their own bank's bill-pay/ACH screen. RentMore
// never transmits it and never touches owner funds. Reads the persisted batch
// (calculated + pending ACH rows) so the file matches what's on screen.
export const generateAchListExport = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      SELECT p.owner_id, p.net_cents, p.period_start, p.period_end,
             o.name, o.routing_number, o.account_number
      FROM payouts p
      JOIN owners o ON o.id = p.owner_id
      WHERE p.company_id = ${data.companyId}::uuid
        AND p.status IN ('calculated','pending')
        AND p.method = 'ach'
        AND p.net_cents > 0
      ORDER BY o.name`;

    // Aggregate per owner (one line per owner in the bank file).
    const totals = new Map<string, { name: string; routing: string; account: string; net: number }>();
    for (const r of rows) {
      const t = totals.get(r.owner_id) || {
        name: r.name || "",
        routing: r.routing_number || "",
        account: r.account_number || "",
        net: 0,
      };
      t.net += Number(r.net_cents) || 0;
      totals.set(r.owner_id, t);
    }

    const lines = ["Owner Name,Routing Number,Account Number,Amount"];
    for (const [, t] of totals) {
      if (t.net <= 0 || !t.routing || !t.account) continue; // only positive ACH payouts with bank details
      const name = /[",\n]/.test(t.name) ? `"${t.name.replace(/"/g, '""')}"` : t.name;
      lines.push(`${name},${t.routing},${t.account},${(t.net / 100).toFixed(2)}`);
    }
    return lines.join("\n");
  });

// ── Payment Methods ──
export const fetchPaymentMethods = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      SELECT id, company_id, property_id, booking_id, method_type, label, card_last4,
             card_expiry, card_brand, bank_name, account_last4, routing_last4,
             is_default, created_at
      FROM payment_methods WHERE company_id = ${data.companyId}::uuid
    `;
    return rows.map(jsonSafe);
  });

export const insertPaymentMethod = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; propertyId?: string; bookingId?: string; methodType: string; label?: string; cardLast4?: string; cardExpiry?: string; cardBrand?: string; bankName?: string; accountLast4?: string; routingLast4?: string; isDefault?: boolean }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      INSERT INTO payment_methods (company_id, property_id, booking_id, method_type, label, card_last4, card_expiry, card_brand, bank_name, account_last4, routing_last4, is_default)
      VALUES (${data.companyId}::uuid, ${data.propertyId || null}::uuid, ${data.bookingId || null}::uuid, ${data.methodType}, ${data.label || null}, ${data.cardLast4 || null}, ${data.cardExpiry || null}, ${data.cardBrand || null}, ${data.bankName || null}, ${data.accountLast4 || null}, ${data.routingLast4 || null}, ${data.isDefault ?? false})
      RETURNING id
    `;
    return rows[0];
  });

export const deletePaymentMethod = createServerFn()
  .validator((data: { methodId: string }) => data)
  .handler(async ({ data, request }) => {
    // SECURITY: only the company that owns the payment method may delete it.
    await assertCompanyOwner(request as Request | undefined, await (async () => {
      const r = await sql()`SELECT company_id FROM payment_methods WHERE id = ${data.methodId}::uuid LIMIT 1`;
      return r.length ? String(r[0].company_id) : null;
    })());
    await sql()`
      DELETE FROM payment_methods WHERE id = ${data.methodId}::uuid
    `;
  });

// ── On-demand payments (saved payment method + charge-from-reservation) ──
// Owner decision (Aug 14): the PM can charge a guest's saved card/ACH anytime
// from inside a reservation (damages, utility pass-through, balance). The
// guest pays the convenience fee on EVERY processed charge (3.5% card / ACH free);
// RentMore takes $0; card: PM nets charge + leftover; ACH: PM absorbs Stripe cost.
// This reuses the identical fee model (guestTotalCents/pmNetCents in fees.ts).
// Real off-session charging is gated behind an onboarding-complete Connect
// account; the demo company stays on the mock path.

/**
 * Collect a guest payment method ONCE (legally required — the cardholder must
 * enter their own card + consent to keep it on file). Uses Stripe-hosted
 * Checkout in `setup` mode so no client-side Stripe Elements are needed — the
 * guest enters the card on Stripe's page; the resulting PaymentMethod id is
 * persisted into payment_methods (via the setup_intent.succeeded webhook /
 * saveTokenizedPaymentMethod). Returns a redirect URL (or a mock for demo).
 */
export const createSetupCheckout = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: {
    companyId: string;
    bookingId?: string;
    propertyId?: string;
    guestEmail?: string;
    method: "card" | "ach";
  }) => data)
  .handler(async ({ data }) => {
    if (data.companyId === DEFAULT_COMPANY_ID) {
      return { url: null, setupIntentId: `seti_demo_${Date.now()}`, mock: true };
    }
    const companyRows = await sql()`
      SELECT stripe_connect_account_id, stripe_connect_onboarding_complete
      FROM companies WHERE id = ${data.companyId}::uuid LIMIT 1`;
    const company = companyRows[0];
    if (!company || !company.stripe_connect_account_id || !company.stripe_connect_onboarding_complete) {
      throw new Error("Online payments are not enabled for this company — complete Stripe onboarding first.");
    }
    const { stripe } = await import("~/lib/stripe");
    const meta: Record<string, string> = {
      company_id: data.companyId,
      method: data.method === "ach" ? "ach" : "card",
      mode: "ondemand-save",
    };
    if (data.bookingId) meta.booking_id = data.bookingId;
    if (data.propertyId) meta.property_id = data.propertyId;
    // SECURITY (2026-08-29, owner report): guests who complete the "keep a card on
    // file" (ondemand-save) setup MUST land on the PUBLIC guest portal, NEVER inside
    // the authenticated PM dashboard (/bookings) or any account. Pointing success_url
    // at /bookings/<id> dropped the guest into the internal dashboard shell (DashboardLayout).
    // Mirror the guest checkout flow (success_url = /guest/<id>?checkout=success) so the
    // post-save landing is the public portal for this reservation. The guest portal
    // resolves the booking by UUID (fetchBookingByReservationNumber matches b.id::text),
    // so the same booking id works here.
    const returnBase = data.bookingId
      ? `${SITE_BASE}/guest/${encodeURIComponent(data.bookingId)}`
      : `${SITE_BASE}/bookings`;
    // CRITICAL (2026-08-23, diagnostic collect-card-api-diagnostic.md): with
    // setup-mode on_behalf_of but NO Customer, Stripe attaches the saved PM to
    // the PLATFORM account, not the connected account (observed: context=platform,
    // connected paymentMethods.list=[] despite on_behalf_of). For the
    // collect-then-charge flow (Option A, separate charges) the PM MUST live on a
    // Customer on the CONNECTED account so createOnDemandCharge (on_behalf_of +
    // off_session) can charge it later. So we create (or reuse) a stripped-back
    // Customer ON the connected account (stripeAccount = acct) and pass it as
    // `customer` — the resulting PaymentMethod then attaches to that connected
    // account Customer. `customer` and `customer_email` are mutually exclusive,
    // so we only fall back to customer_email when no guest email is known.
    const acctId = company.stripe_connect_account_id;
    const email = data.guestEmail?.trim() || undefined;
    let customerId: string | undefined;
    if (email) {
      const existing = await stripe().customers.list(
        { email, limit: 1 },
        { stripeAccount: acctId },
      );
      customerId = existing.data[0]?.id;
    }
    if (!customerId) {
      const cust = await stripe().customers.create(
        { ...(email ? { email } : {}), metadata: { company_id: data.companyId } },
        { stripeAccount: acctId },
      );
      customerId = cust.id;
    }
    const session = await stripe().checkout.sessions.create({
      mode: "setup",
      // Stripe rejects top-level `on_behalf_of` on mode:"setup" sessions
      // ("Received unknown parameter: on_behalf_of") — the connected account
      // (customer = merchant of record) must be declared via
      // setup_intent_data.on_behalf_of so the saved PaymentMethod/customer are
      // attributed to the CONNECTED account, not the platform. (2026-08-21)
      ...(customerId ? { customer: customerId } : { customer_email: email || undefined }),
      payment_method_types: data.method === "ach" ? ["us_bank_account"] : ["card"],
      metadata: meta,
      payment_method_data: { allow_redisplay: "always" },
      setup_intent_data: {
        // Stripe does NOT copy session-level `metadata` onto the SetupIntent in
        // setup mode — the SetupIntent that shows up in setup_intent.succeeded
        // only inherits `setup_intent_data.metadata`. Without it here, the
        // webhook's handleSetupIntent sees empty metadata (no company_id) and
        // skips persistence entirely (the observed bug: collected guest card
        // never saved to the reservation even though the owner entered it).
        // Mirrors the working payment path, which attaches metadata inside
        // payment_intent_data.metadata. (2026-08-21)
        metadata: meta,
      },
      // CRITICAL (2026-08-27 live smoke test): the connected-account Customer
      // only exists on the connected account, so the setup Checkout session MUST
      // run ON that account via the { stripeAccount: acctId } request option, or
      // Stripe returns "No such customer" (session runs on the platform). With the
      // session on the connected account, the saved PaymentMethod automatically
      // attaches to the connected account — `on_behalf_of` in setup_intent_data is
      // no longer needed (and keeping it is redundant/unnecessary). We still pass
      // setup_intent_data.metadata because the setup_intent.succeeded webhook reads
      // its metadata from there (session metadata is NOT copied in setup mode).
      success_url: `${returnBase}?ondemand=method-saved`,
      cancel_url: `${returnBase}?ondemand=cancelled`,
    }, // request options — run the session on the connected account
    { stripeAccount: acctId },
  );
    return { url: session.url, setupIntentId: session.id, customerId, mock: false };
  });

/**
 * Store a tokenized Stripe PaymentMethod on the reservation after the guest
 * completes the "keep on file" setup flow. Idempotent on stripe_pm_id.
 */
export const saveTokenizedPaymentMethod = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: {
    companyId: string;
    propertyId?: string;
    bookingId?: string;
    methodType: "credit_card" | "ACH";
    label?: string;
    cardLast4?: string;
    cardExpiry?: string;
    cardBrand?: string;
    bankName?: string;
    accountLast4?: string;
    stripePmId: string;
    stripeCustomerId?: string;
  }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      INSERT INTO payment_methods (company_id, property_id, booking_id, method_type, label,
        card_last4, card_expiry, card_brand, bank_name, account_last4, stripe_pm_id, stripe_customer_id)
      VALUES (${data.companyId}::uuid, ${data.propertyId || null}::uuid, ${data.bookingId || null}::uuid,
        ${data.methodType}, ${data.label || null}, ${data.cardLast4 || null}, ${data.cardExpiry || null},
        ${data.cardBrand || null}, ${data.bankName || null}, ${data.accountLast4 || null},
        ${data.stripePmId}, ${data.stripeCustomerId || null})
      ON CONFLICT (stripe_pm_id) DO UPDATE SET
        booking_id = EXCLUDED.booking_id,
        label = EXCLUDED.label, card_last4 = EXCLUDED.card_last4,
        card_brand = EXCLUDED.card_brand, stripe_customer_id = EXCLUDED.stripe_customer_id
      RETURNING id
    `;
    return rows[0];
  });

/**
 * Charge a saved payment method off-session from inside a reservation.
 * The guest pays amount + convenience fee; RentMore $0; PM nets amount + residual.
 */
export const createOnDemandCharge = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: {
    companyId: string;
    bookingId: string;
    methodId: string;
    propertyId?: string;
    amountCents: number;
    reason: string;
  }) => data)
  .handler(async ({ data }) => {
    if (data.amountCents <= 0) throw new Error("Charge amount must be greater than zero.");
    const pms = await sql()`
      SELECT id, method_type, label, card_last4, stripe_pm_id, stripe_customer_id, bank_name, account_last4
      FROM payment_methods WHERE id = ${data.methodId}::uuid`;
    const pm = pms[0];
    if (!pm) throw new Error("Saved payment method not found.");
    const isAch = pm.method_type === "ACH";
    const method = isAch ? "ACH" : "credit card";
    const guestTotal = guestTotalCents(data.amountCents, method);
    const pmNet = pmNetCents(data.amountCents, method);
    const stripePmId = pm.stripe_pm_id;
    const stripeCustomerId = pm.stripe_customer_id || undefined;
    const description = `On-demand ${isAch ? "ACH" : "card"} charge — ${data.reason}`;
    const processingFee = stripeFeeCents(guestTotal, method);
    // Demo company (or a saved method with no Stripe token yet): mock the
    // charge but still record the ledger row so the reservation page
    // demonstrably persists an on-demand payment.
    if (data.companyId === DEFAULT_COMPANY_ID || !stripePmId) {
      const demoPiId = `pi_ondemand_demo_${Date.now()}`;
      await sql()`
        INSERT INTO payments (company_id, booking_id, property_id, payment_type, method,
          amount_cents, description, status, stripe_payment_intent_id, processing_fee_cents)
        VALUES (${data.companyId}::uuid, ${data.bookingId}::uuid,
          ${data.propertyId || null}::uuid, 'charge', ${isAch ? "ach" : "credit_card"},
          ${pmNet}, ${description}, 'completed', ${demoPiId}, ${processingFee})
        ON CONFLICT (stripe_payment_intent_id) DO NOTHING`;
      return { mock: true, paymentIntentId: demoPiId, amountCents: data.amountCents, guestTotalCents: guestTotal, pmNetCents: pmNet, reason: data.reason };
    }
    const companyRows = await sql()`
      SELECT stripe_connect_account_id, stripe_connect_onboarding_complete
      FROM companies WHERE id = ${data.companyId}::uuid LIMIT 1`;
    const company = companyRows[0];
    if (!company || !company.stripe_connect_account_id || !company.stripe_connect_onboarding_complete) {
      throw new Error("Online payments are not enabled for this company — complete Stripe onboarding first.");
    }
    const { stripe } = await import("~/lib/stripe");
    const meta: Record<string, string> = {
      company_id: data.companyId,
      payment_type: "charge",
      method: isAch ? "ach" : "card",
      booking_amount_cents: String(data.amountCents),
      pm_net_cents: String(pmNet),
      booking_id: data.bookingId,
    };
    if (data.propertyId) meta.property_id = data.propertyId;
    // Off-session charge against the saved PaymentMethod on the connected
    // account (customer = merchant of record). RentMore is never the merchant
    // of record. `customer` (on the connected account) must be passed for an
    // off-session charge of a saved PM; it is set by the collect flow and
    // recorded on the method row.
    // CRITICAL: run the request in the CONNECTED account's context via the
    // RequestOptions { stripeAccount } (which sends the Stripe-Account header).
    // The saved PaymentMethod and its Customer live on the connected account —
    // PaymentMethods are tenant-scoped and not resolvable from the platform
    // context, so without the header Stripe throws "No such PaymentMethod ... on
    // one of your connected accounts". Do NOT set the top-level `on_behalf_of`
    // param when running as the connected account — Stripe rejects it with
    // "The 'on_behalf_of' param cannot be set to your own account". Running in
    // the connected-account context makes the connected account the merchant of
    // record (direct-charge model), which satisfies RentMore-never-merchant.
    const pi = await stripe().paymentIntents.create(
      {
        amount: guestTotal,
        currency: "usd",
        payment_method: stripePmId,
        ...(stripeCustomerId ? { customer: stripeCustomerId } : {}),
        payment_method_types: isAch ? ["us_bank_account"] : ["card"],
        confirm: true,
        off_session: true,
        description,
        metadata: meta,
      },
      { stripeAccount: company.stripe_connect_account_id },
    );
    // Record the ledger row immediately (webhook reconciles idempotently via
    // stripe_payment_intent_id UNIQUE). amount_cents = what the PM receives.
    await sql()`
      INSERT INTO payments (company_id, booking_id, property_id, payment_type, method,
        amount_cents, description, status, stripe_payment_intent_id, processing_fee_cents)
      VALUES (${data.companyId}::uuid, ${data.bookingId}::uuid,
        ${data.propertyId || null}::uuid, 'charge', ${isAch ? "ach" : "credit_card"},
        ${pmNet}, ${description}, ${pi.status === "succeeded" ? "completed" : "failed"},
        ${pi.id}, ${processingFee})
      ON CONFLICT (stripe_payment_intent_id) DO NOTHING`;
    return {
      mock: false,
      paymentIntentId: pi.id,
      status: pi.status,
      amountCents: data.amountCents,
      guestTotalCents: guestTotal,
      pmNetCents: pmNet,
      reason: data.reason,
    };
  });

// ── Leads ──
export const fetchLeads = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      SELECT id, company_id, name, email, phone, source, stage,
             property_id, value, notes, date, created_at
      FROM leads WHERE company_id = ${data.companyId}::uuid
      ORDER BY date DESC NULLS LAST, created_at DESC
    `;
    return rows.map(jsonSafe);
  });

export const insertLead = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: {
    companyId: string; name: string; email?: string; phone?: string; source?: string;
    stage: string; propertyId?: string; value?: number; notes?: string; date?: string;
  }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      INSERT INTO leads (company_id, name, email, phone, source, stage,
                         property_id, value, notes, date)
      VALUES (${data.companyId}::uuid, ${data.name}, ${data.email || null}, ${data.phone || null},
        ${data.source || null}, ${data.stage}, ${uuidOrNull(data.propertyId)}::uuid,
        ${data.value || 0}, ${data.notes || null},
        ${data.date || new Date().toISOString().slice(0, 10)}::date)
      RETURNING id
    `;
    return rows[0];
  });

export const updateLeadDB = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; leadId: string; updates: Record<string, unknown> }) => data)
  .handler(async ({ data }) => {
    const { companyId, leadId, updates } = data;
    if (!Object.keys(updates).length) return;
    const setClauses: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(updates)) {
      const col = camelToSnake(k);
      setClauses.push(`${col} = $${i++}`);
      // property_id is a FK — blank strings must become NULL
      vals.push(col === "property_id" ? uuidOrNull(v as string) : v);
    }
    vals.push(leadId, companyId);
    // NOTE: use sql().query() with positional $n placeholders — the neon driver's
    // tagged-template mode rejects .append(unsafe(...)) with $n placeholders.
    await sql().query(
      `UPDATE leads SET ${setClauses.join(", ")} WHERE id = $${i}::uuid AND company_id = $${i + 1}::uuid`,
      vals
    );
  });

export const deleteLead = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; leadId: string }) => data)
  .handler(async ({ data }) => {
    await sql()`DELETE FROM leads WHERE id = ${data.leadId}::uuid AND company_id = ${data.companyId}::uuid`;
  });

// ── Vendors ──
export const fetchVendors = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`SELECT * FROM vendor_contacts WHERE company_id = ${data.companyId}::uuid ORDER BY created_at DESC`;
    return rows.map((v: any) => ({
      id: v.id, name: v.name, company: v.company || "", email: v.email || "",
      phone: v.phone || "", serviceTypes: (() => { try { return JSON.parse(v.service_types || "[]"); } catch { return []; } })(),
      achInfo: { bankName: v.ach_bank_name || "", routingNumber: v.ach_routing_number || "", accountNumber: v.ach_account_number || "" },
      mailingAddress: (v.mail_street || v.mail_city) ? { street: v.mail_street || "", city: v.mail_city || "", state: v.mail_state || "", zip: v.mail_zip || "" } : undefined,
      notes: v.notes || "", createdAt: dbDateStr(v.created_at),
    }));
  });

export const insertVendor = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; name: string; company?: string; email?: string; phone?: string; serviceTypes?: string[]; achInfo?: { bankName?: string; routingNumber?: string; accountNumber?: string }; mailingAddress?: { street?: string; city?: string; state?: string; zip?: string }; notes?: string }) => data)
  .handler(async ({ data }) => {
    const { achInfo, mailingAddress } = data;
    const rows = await sql()`
      INSERT INTO vendor_contacts (company_id, name, contact_type, company, email, phone, service_types, ach_bank_name, ach_routing_number, ach_account_number, mail_street, mail_city, mail_state, mail_zip, notes)
      VALUES (${data.companyId}::uuid, ${data.name}, 'general', ${data.company || ""}, ${data.email || ""}, ${data.phone || ""},
        ${JSON.stringify(data.serviceTypes || [])}, ${achInfo?.bankName || ""}, ${achInfo?.routingNumber || ""}, ${achInfo?.accountNumber || ""},
        ${mailingAddress?.street || ""}, ${mailingAddress?.city || ""}, ${mailingAddress?.state || ""}, ${mailingAddress?.zip || ""}, ${data.notes || ""})
      RETURNING id
    `;
    return rows[0];
  });

export const updateVendorDB = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; vendorId: string; updates: Record<string, unknown> }) => data)
  .handler(async ({ data }) => {
    const { vendorId, updates } = data;
    if (!Object.keys(updates).length) return;
    const setClauses: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(updates)) {
      setClauses.push(`${camelToSnake(k)} = $${i++}`);
      vals.push(v);
    }
    vals.push(vendorId, data.companyId);
    await sql().query(
      `UPDATE vendor_contacts SET ${setClauses.join(", ")} WHERE id = $${i}::uuid AND company_id = $${i + 1}::uuid`,
      vals
    );
  });

export const deleteVendorDB = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; vendorId: string }) => data)
  .handler(async ({ data }) => {
    await sql()`DELETE FROM vendor_contacts WHERE id = ${data.vendorId}::uuid AND company_id = ${data.companyId}::uuid`;
  });

// ── Housekeeping ──
export const fetchHousekeeping = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`SELECT * FROM housekeeping_tasks WHERE company_id = ${data.companyId}::uuid ORDER BY due_date ASC`;
    return rows.map((h: any) => ({
      id: h.id, propertyId: h.property_id, description: h.description, status: h.status,
      priority: h.priority, assignedTo: h.assigned_to || "", dueDate: dbDateStr(h.due_date),
      window: h.time_window || "", verifiedBy: h.verified_by || undefined,
    }));
  });

export const insertHousekeepingTask = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; propertyId: string; description: string; status?: string; priority?: string; assignedTo?: string; dueDate?: string; window?: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      INSERT INTO housekeeping_tasks (company_id, property_id, description, status, priority, assigned_to, due_date, time_window)
      VALUES (${data.companyId}::uuid, ${data.propertyId}::uuid, ${data.description}, ${data.status || "pending"}, ${data.priority || "medium"},
        ${data.assignedTo || null}, ${data.dueDate || null}, ${data.window || null})
      RETURNING id
    `;
    return rows[0];
  });

export const updateHousekeepingTask = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; taskId: string; updates: Record<string, unknown> }) => data)
  .handler(async ({ data }) => {
    const { taskId, updates } = data;
    if (!Object.keys(updates).length) return;
    const setClauses: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(updates)) {
      const col = camelToSnake(k);
      setClauses.push(`${col} = $${i++}`);
      vals.push(col === "assigned_to" && !v ? null : v);
    }
    vals.push(taskId, data.companyId);
    await sql().query(
      `UPDATE housekeeping_tasks SET ${setClauses.join(", ")} WHERE id = $${i}::uuid AND company_id = $${i + 1}::uuid`,
      vals
    );
  });

export const deleteHousekeepingTask = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; taskId: string }) => data)
  .handler(async ({ data }) => {
    await sql()`DELETE FROM housekeeping_tasks WHERE id = ${data.taskId}::uuid AND company_id = ${data.companyId}::uuid`;
  });

// ── Calendar blocks ──
export const fetchCalendarBlocks = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`SELECT * FROM calendar_blocks WHERE company_id = ${data.companyId}::uuid ORDER BY start_date ASC`;
    return rows.map((b: any) => ({
      id: b.id, propertyId: b.property_id, type: b.type, startDate: dbDateStr(b.start_date),
      endDate: dbDateStr(b.end_date), title: b.title || "",
      color: b.type === "maintenance" ? "#ef4444" : b.type === "lease" ? "#3b82f6" : b.type === "booking" ? "#22c55e" : "#8b5cf6",
    }));
  });

export const insertCalendarBlock = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; propertyId: string; startDate: string; endDate: string; type?: string; title?: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      INSERT INTO calendar_blocks (company_id, property_id, start_date, end_date, type, title)
      VALUES (${data.companyId}::uuid, ${data.propertyId}::uuid, ${data.startDate}, ${data.endDate}, ${data.type || "blocked"}, ${data.title || null})
      RETURNING id
    `;
    return rows[0];
  });

export const deleteCalendarBlock = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; blockId: string }) => data)
  .handler(async ({ data }) => {
    await sql()`DELETE FROM calendar_blocks WHERE id = ${data.blockId}::uuid AND company_id = ${data.companyId}::uuid`;
  });

// ── Documents ──
export const fetchDocuments = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`SELECT * FROM documents WHERE company_id = ${data.companyId}::uuid ORDER BY created_at DESC`;
    return rows.map((d: any) => ({
      id: d.id, propertyId: d.property_id || undefined, type: d.type || "lease", title: d.title,
      status: d.status, recipientName: d.recipient_name || "", recipientEmail: d.recipient_email || "",
      content: d.content || "", createdAt: dbDateStr(d.created_at),
    }));
  });

export const insertDocument = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; propertyId?: string; title: string; content?: string; type?: string; status?: string; recipientName?: string; recipientEmail?: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      INSERT INTO documents (company_id, property_id, title, content, type, status, recipient_name, recipient_email)
      VALUES (${data.companyId}::uuid, ${data.propertyId ? data.propertyId + "::uuid" : null}, ${data.title}, ${data.content || null},
        ${data.type || "lease"}, ${data.status || "draft"}, ${data.recipientName || null}, ${data.recipientEmail || null})
      RETURNING id
    `;
    return rows[0];
  });

export const updateDocumentDB = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; documentId: string; updates: Record<string, unknown> }) => data)
  .handler(async ({ data }) => {
    const { documentId, updates } = data;
    if (!Object.keys(updates).length) return;
    const setClauses: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(updates)) {
      setClauses.push(`${camelToSnake(k)} = $${i++}`);
      vals.push(v);
    }
    vals.push(documentId, data.companyId);
    await sql().query(
      `UPDATE documents SET ${setClauses.join(", ")} WHERE id = $${i}::uuid AND company_id = $${i + 1}::uuid`,
      vals
    );
  });

export const deleteDocumentDB = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; documentId: string }) => data)
  .handler(async ({ data }) => {
    await sql()`DELETE FROM documents WHERE id = ${data.documentId}::uuid AND company_id = ${data.companyId}::uuid`;
  });

// ── Helpers ──
function dbDateStr(v: any): string {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuidOrNull(x: string | null | undefined): string | null {
  if (!x) return null;
  return UUID_RE.test(x) ? x : null;
}

// ── Tax settings ──
export const fetchTaxRate = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      SELECT rate FROM tax_settings
      WHERE company_id = ${data.companyId}::uuid
        AND name = 'NH Rooms & Meals'
        AND is_active = true
      LIMIT 1
    `;
    return rows.length > 0 ? Number(rows[0].rate) : null;
  });

export const upsertTaxRate = createServerFn()
  .middleware([requireCompanyAuth])
  .validator((data: { companyId: string; rate: number }) => data)
  .handler(async ({ data }) => {
    await sql()`
      INSERT INTO tax_settings (company_id, name, rate, tax_type, applies_to, is_active)
      VALUES (${data.companyId}::uuid, 'NH Rooms & Meals', ${data.rate}, 'lodging', 'short_term', true)
      ON CONFLICT (company_id, name)
      DO UPDATE SET rate = EXCLUDED.rate, updated_at = NOW()
    `;
  });
