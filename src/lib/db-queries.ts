// RentVue — Database query layer (Neon Postgres via TanStack Start server functions)
// All DB access goes through createServerFn handlers; never call sql() directly from client code.
import { createServerFn } from "@tanstack/react-start";
import { sql } from "~/db";

export const DEFAULT_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

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
      VALUES (${data.name}, ${slug}, 'free')
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
    return rows[0];
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
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(updates)) {
      const col = camelToSnake(k);
      sets.push(`${col} = $${i++}`);
      vals.push(v);
    }
    vals.push(bookingId);
    await sql()`UPDATE bookings SET `.append(
      // Use raw interpolation for dynamic column names
      sql().unsafe(`UPDATE bookings SET ${sets.join(", ")} WHERE id = $${i}::uuid`, vals)
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
    await sql()`UPDATE maintenance_requests SET `.append(
      sql().unsafe(`UPDATE maintenance_requests SET ${setClauses.join(", ")} WHERE id = $${i}::uuid`, vals)
    );
  });

// ── Owners ──
export const fetchOwners = createServerFn()
  .validator((data: { companyId: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      SELECT id, company_id, name, email, phone, stripe_connect_id, payout_schedule, created_at
      FROM owners WHERE company_id = ${data.companyId}::uuid
    `;
    return rows.map(jsonSafe);
  });

export const insertOwner = createServerFn()
  .validator((data: { companyId: string; name: string; email?: string; phone?: string }) => data)
  .handler(async ({ data }) => {
    const rows = await sql()`
      INSERT INTO owners (company_id, name, email, phone)
      VALUES (${data.companyId}::uuid, ${data.name}, ${data.email || null}, ${data.phone || null})
      RETURNING id
    `;
    return rows[0];
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

// ── Helpers ──
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
