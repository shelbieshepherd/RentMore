// RentVue — Database query layer (Neon Postgres via TanStack Start server functions)
// All DB access goes through createServerFn handlers; never call sql() directly from client code.
import { createServerFn } from "@tanstack/react-start";
import { sql } from "~/db";
import { processingFee } from "./fees";
import { calculateOwnerPayouts } from "./payouts";

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
      WHERE email = ${data.email} AND password_hash = crypt(${data.password}, password_hash)
      LIMIT 1
    `;
    return rows[0] || null;
  });

export const fetchUserById = createServerFn()
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      SELECT id, company_id, email, name, role, email_verified
      FROM users WHERE id = ${data.id}::uuid
      LIMIT 1
    `;
    return rows[0] || null;
  });

export const fetchUsersByCompany = createServerFn()
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
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      SELECT subscription_tier FROM companies WHERE id = ${data.companyId}::uuid LIMIT 1
    `;
    return rows[0]?.subscription_tier || null;
  });

export const updateCompanySubscription = createServerFn()
  .validator((data: { companyId: string; subscriptionTier: string }) => data)
  .handler(async ({ data }) => {
    await sql()`
      UPDATE companies SET subscription_tier = ${data.subscriptionTier}
      WHERE id = ${data.companyId}::uuid
    `;
    return { success: true };
  });

export const registerCompany = createServerFn()
  .validator((data: { name: string; email: string; password: string }) => data)
  .handler(async ({ data }) => {
    // Check duplicate email first
    const existing = await sql()`
      SELECT id FROM users WHERE email = ${data.email} LIMIT 1
    `;
    if (existing.length > 0) {
      throw new Error("EMAIL_TAKEN");
    }
    // Create company
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const companyRows = await sql()`
      INSERT INTO companies (name, slug, subscription_tier)
      VALUES (${data.name}, ${slug}, 'starter')
      RETURNING id
    `;
    const companyId = companyRows[0].id;
    // Generate verification token (24h expiry)
    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 86400000).toISOString();
    // Create admin user with bcrypt hash + verification token
    const userRows = await sql()`
      INSERT INTO users (company_id, email, password_hash, name, role, verify_token, verify_token_expires)
      VALUES (${companyId}::uuid, ${data.email},
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
  .validator((data: { companyId: string; email: string; password: string; name: string; role: string }) => data)
  .handler(async ({ data }) => {
    const existing = await sql()`
      SELECT id FROM users WHERE company_id = ${data.companyId}::uuid AND email = ${data.email} LIMIT 1
    `;
    if (existing.length > 0) {
      throw new Error("EMAIL_TAKEN");
    }
    const rows = await sql()`
      INSERT INTO users (company_id, email, password_hash, name, role)
      VALUES (${data.companyId}::uuid, ${data.email},
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
  .validator((data: {
    companyId: string; id: string;
    name?: string; email?: string; role?: string; password?: string;
  }) => data)
  .handler(async ({ data }) => {
    if (data.email) {
      const dup = await sql()`
        SELECT id FROM users
        WHERE company_id = ${data.companyId}::uuid AND email = ${data.email} AND id <> ${data.id}::uuid
        LIMIT 1
      `;
      if (dup.length > 0) throw new Error("EMAIL_TAKEN");
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

// ── Properties ──
export const fetchProperties = createServerFn()
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
  .validator((data: { companyId: string; propertyId: string; guestName: string; guestEmail: string; guestPhone?: string; guestAddress?: string; startDate: string; endDate: string; nightlyRate: number; status: string; totalAmount: number; source: string; commissionRate: number; createdBy: string; cleaningFee?: number; linenFee?: number; taxAmount?: number }) => data)
  .handler(async ({ data }) => {
    const rn = `BK-${Date.now().toString(36).toUpperCase()}`;
    const rows = await sql()`
      INSERT INTO bookings (company_id, property_id, guest_name, guest_email, guest_phone, guest_address, start_date, end_date, nightly_rate, status, total_amount, source, reservation_number, commission_rate, created_by, cleaning_fee, linen_fee, tax_amount)
      VALUES (${data.companyId}::uuid, ${data.propertyId}::uuid, ${data.guestName}, ${data.guestEmail}, ${data.guestPhone || null}, ${data.guestAddress || null}, ${data.startDate}::date, ${data.endDate}::date, ${data.nightlyRate}, ${data.status}, ${data.totalAmount}, ${data.source}, ${rn}, ${data.commissionRate}, ${data.createdBy}, ${data.cleaningFee ?? null}, ${data.linenFee ?? null}, ${data.taxAmount ?? null})
      RETURNING id
    `;
    return rows[0];
  });

export const updateBookingDB = createServerFn()
  .validator((data: { bookingId: string; updates: Record<string, unknown> }) => data)
  .handler(async ({ data }) => {
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
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      SELECT id, company_id, booking_id, tenant_id, property_id, payment_type, method,
             amount_cents, description, status, check_number, created_at
      FROM payments WHERE company_id = ${data.companyId}::uuid
      ORDER BY created_at DESC
    `;
    return rows.map(jsonSafe);
  });

export const insertPayment = createServerFn()
  .validator((data: { companyId: string; bookingId?: string; tenantId?: string; propertyId: string; paymentType: string; method: string; amountCents: number; description: string; status: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      INSERT INTO payments (company_id, booking_id, tenant_id, property_id, payment_type, method, amount_cents, description, status)
      VALUES (${data.companyId}::uuid, ${uuidOrNull(data.bookingId)}::uuid, ${uuidOrNull(data.tenantId)}::uuid, ${data.propertyId}::uuid, ${data.paymentType}, ${data.method}, ${data.amountCents}, ${data.description}, ${data.status})
      RETURNING id
    `;
    return rows[0];
  });

// ── Stripe Connect (Option A — separate charges, RentMore never merchant of record) ──
// Demo company stays on the mock path: never touches the real Stripe API.

export const createConnectAccount = createServerFn()
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
  .handler(async ({ data }) => {
    if (data.accountId === "acct_demo_mock") return { url: null, mock: true };
    const { getOnboardingLink: makeLink } = await import("~/lib/stripe");
    const link = await makeLink({
      accountId: data.accountId,
      refreshUrl: `${SITE_BASE}/settings/payments`,
      returnUrl: `${SITE_BASE}/settings/payments?onboarded=1`,
    });
    return { url: link.url };
  });

export const setConnectOnboardingComplete = createServerFn()
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    if (data.companyId === DEFAULT_COMPANY_ID) return { success: true };
    await sql()`
      UPDATE companies SET stripe_connect_onboarding_complete = true WHERE id = ${data.companyId}::uuid`;
    return { success: true };
  });

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
  .validator((data: { companyId: string; amountCents: number; paymentType: string; bookingId?: string; method?: string }) => data)
  .handler(async ({ data }) => {
    const isAch = data.method === "ach";
    const feeCents = processingFee(data.amountCents, isAch ? "ACH" : "credit card");
    if (data.companyId === DEFAULT_COMPANY_ID) {
      return { url: null, sessionId: `cs_demo_${Date.now()}`, mock: true, feeCents };
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
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: { currency: "usd", product_data: { name: productName }, unit_amount: data.amountCents },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: feeCents,
        on_behalf_of: company.stripe_connect_account_id, // customer = merchant of record
      },
      payment_method_types: isAch ? ["us_bank_account"] : ["card"],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    return { url: session.url, sessionId: session.id, feeCents };
  });

export const fetchBookingByReservationNumber = createServerFn()
  .validator((data: { reservationNumber: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      SELECT b.id, b.company_id, b.property_id, b.guest_name, b.guest_email, b.guest_phone,
             b.guest_address, b.start_date, b.end_date, b.nightly_rate, b.status,
             b.total_amount, b.reservation_number, b.deposit_collected_cents, b.created_at,
             p.name AS property_name
      FROM bookings b
      JOIN properties p ON p.id = b.property_id
      WHERE b.reservation_number = ${data.reservationNumber}
      LIMIT 1
    `;
    return rows[0] ? jsonSafe(rows[0]) : null;
  });

// ── Maintenance ──
export const fetchMaintenanceRequests = createServerFn()
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
  .handler(async ({ data }) => {
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
  .handler(async ({ data }) => {
    await sql()`
      UPDATE payments SET status = ${data.status} WHERE id = ${data.paymentId}::uuid
    `;
  });

// ── updateMaintenanceRequest ──
export const updateMaintenanceRequestDB = createServerFn()
  .validator((data: { requestId: string; updates: Record<string, unknown> }) => data)
  .handler(async ({ data }) => {
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
  .validator((data: { companyId: string; name: string; email?: string; phone?: string; bankName?: string; routingNumber?: string; accountNumber?: string; payoutMethod?: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      INSERT INTO owners (company_id, name, email, phone, bank_name, routing_number, account_number, payout_method)
      VALUES (${data.companyId}::uuid, ${data.name}, ${data.email || null}, ${data.phone || null},
        ${data.bankName || null}, ${data.routingNumber || null}, ${data.accountNumber || null},
        ${data.payoutMethod || "ach"})
      RETURNING id
    `;
    return rows[0];
  });

export const updateOwner = createServerFn()
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
      `UPDATE owners SET ${setClauses.join(", ")} WHERE id = $${i}::uuid AND company_id = $${i + 1}::uuid`,
      vals
    );
  });

// ── Owner payouts — hybrid v1: ACH-list CSV export (NO money movement) ──
// The PM uploads this file to their own bank's bill-pay/ACH screen. RentMore
// never transmits it and never touches owner funds. Amount = each owner's net
// payout for the current calendar month, from the shared payout engine.
export const generateAchListExport = createServerFn()
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    const [ownerRows, propRows, payRows, maintRows] = await Promise.all([
      sql()`SELECT id, name, routing_number, account_number, payout_method FROM owners WHERE company_id = ${data.companyId}::uuid`,
      sql()`SELECT id, owner_id, name FROM properties WHERE company_id = ${data.companyId}::uuid`,
      sql()`SELECT id, property_id, amount_cents, description, status, created_at FROM payments WHERE company_id = ${data.companyId}::uuid AND payment_type IN ('charge','deposit')`,
      sql()`SELECT id, property_id, description, priority, status, created_at, updated_at FROM maintenance_requests WHERE company_id = ${data.companyId}::uuid`,
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
    const now = new Date();
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const end = now.toISOString().slice(0, 10);
    const statements = calculateOwnerPayouts(owners, properties, payments, maintenance, start, end);

    // Aggregate per-owner net payout across their properties
    const totals = new Map<string, { name: string; routing: string; account: string; net: number }>();
    for (const s of statements) {
      const owner = ownerRows.find((o) => o.id === s.ownerId);
      if (!owner) continue;
      const t = totals.get(s.ownerId) || {
        name: s.ownerName,
        routing: owner.routing_number || "",
        account: owner.account_number || "",
        net: 0,
      };
      t.net += s.netPayout;
      totals.set(s.ownerId, t);
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
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      SELECT id, company_id, property_id, method_type, label, card_last4,
             card_expiry, card_brand, bank_name, account_last4, routing_last4,
             is_default, created_at
      FROM payment_methods WHERE company_id = ${data.companyId}::uuid
    `;
    return rows.map(jsonSafe);
  });

export const insertPaymentMethod = createServerFn()
  .validator((data: { companyId: string; propertyId?: string; methodType: string; label?: string; cardLast4?: string; cardExpiry?: string; cardBrand?: string; bankName?: string; accountLast4?: string; routingLast4?: string; isDefault?: boolean }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      INSERT INTO payment_methods (company_id, property_id, method_type, label, card_last4, card_expiry, card_brand, bank_name, account_last4, routing_last4, is_default)
      VALUES (${data.companyId}::uuid, ${data.propertyId || null}::uuid, ${data.methodType}, ${data.label || null}, ${data.cardLast4 || null}, ${data.cardExpiry || null}, ${data.cardBrand || null}, ${data.bankName || null}, ${data.accountLast4 || null}, ${data.routingLast4 || null}, ${data.isDefault ?? false})
      RETURNING id
    `;
    return rows[0];
  });

export const deletePaymentMethod = createServerFn()
  .validator((data: { methodId: string }) => data)
  .handler(async ({ data }) => {
    await sql()`
      DELETE FROM payment_methods WHERE id = ${data.methodId}::uuid
    `;
  });

// ── Leads ──
export const fetchLeads = createServerFn()
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
  .validator((data: { companyId: string; leadId: string }) => data)
  .handler(async ({ data }) => {
    await sql()`DELETE FROM leads WHERE id = ${data.leadId}::uuid AND company_id = ${data.companyId}::uuid`;
  });

// ── Vendors ──
export const fetchVendors = createServerFn()
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
  .validator((data: { companyId: string; vendorId: string }) => data)
  .handler(async ({ data }) => {
    await sql()`DELETE FROM vendor_contacts WHERE id = ${data.vendorId}::uuid AND company_id = ${data.companyId}::uuid`;
  });

// ── Housekeeping ──
export const fetchHousekeeping = createServerFn()
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
  .validator((data: { companyId: string; taskId: string }) => data)
  .handler(async ({ data }) => {
    await sql()`DELETE FROM housekeeping_tasks WHERE id = ${data.taskId}::uuid AND company_id = ${data.companyId}::uuid`;
  });

// ── Calendar blocks ──
export const fetchCalendarBlocks = createServerFn()
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
  .validator((data: { companyId: string; blockId: string }) => data)
  .handler(async ({ data }) => {
    await sql()`DELETE FROM calendar_blocks WHERE id = ${data.blockId}::uuid AND company_id = ${data.companyId}::uuid`;
  });

// ── Documents ──
export const fetchDocuments = createServerFn()
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
  .validator((data: { companyId: string; rate: number }) => data)
  .handler(async ({ data }) => {
    await sql()`
      INSERT INTO tax_settings (company_id, name, rate, tax_type, applies_to, is_active)
      VALUES (${data.companyId}::uuid, 'NH Rooms & Meals', ${data.rate}, 'lodging', 'short_term', true)
      ON CONFLICT (company_id, name)
      DO UPDATE SET rate = EXCLUDED.rate, updated_at = NOW()
    `;
  });
