const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

// Simple valid UUIDs: 00000000-0000-0000-0000-0000000000XX
const CID = '00000000-0000-0000-0000-000000000001';

async function seed() {
  // Company
  await sql.query(`INSERT INTO companies (id, name, slug, subscription_tier) VALUES ($1, 'RentVue Demo', 'rentvue-demo', 'starter') ON CONFLICT (slug) DO NOTHING`, [CID]);

  // Users
  await sql.query(`INSERT INTO users (id, company_id, email, password_hash, name, role) VALUES
    ('00000000-0000-0000-0000-000000000011', $1, 'admin@rentvue.com', '$2b$10$placeholder_hash', 'Admin', 'admin'),
    ('00000000-0000-0000-0000-000000000012', $1, 'manager@rentvue.com', '$2b$10$placeholder_hash', 'Sarah Chen', 'manager'),
    ('00000000-0000-0000-0000-000000000013', $1, 'staff@rentvue.com', '$2b$10$placeholder_hash', 'Mike Ross', 'staff')
  ON CONFLICT (company_id, email) DO NOTHING`, [CID]);

  // Owners
  await sql.query(`INSERT INTO owners (id, company_id, name, email, phone, payout_schedule) VALUES
    ('00000000-0000-0000-0000-000000000021', $1, 'Robert Chen', 'robert@email.com', '555-0201', 'monthly'),
    ('00000000-0000-0000-0000-000000000022', $1, 'Maria Santos', 'maria@email.com', '555-0202', 'monthly')
  ON CONFLICT DO NOTHING`, [CID]);

  // Properties
  await sql.query(`INSERT INTO properties (id, company_id, owner_id, name, address, property_type, beds, baths, nightly_rate, monthly_rent, status) VALUES
    ('00000000-0000-0000-0000-000000000101', $1, '00000000-0000-0000-0000-000000000021', 'Sunset Villa', '123 Ocean Dr, Malibu, CA 90265', 'short_term', 3, 2.0, 450, 0, 'active'),
    ('00000000-0000-0000-0000-000000000102', $1, '00000000-0000-0000-0000-000000000021', 'Mountain Lodge', '456 Pine Rd, Aspen, CO 81611', 'short_term', 4, 3.0, 650, 0, 'active'),
    ('00000000-0000-0000-0000-000000000103', $1, '00000000-0000-0000-0000-000000000022', 'City Loft', '789 Broadway, New York, NY 10003', 'short_term', 1, 1.0, 300, 0, 'active'),
    ('00000000-0000-0000-0000-000000000104', $1, '00000000-0000-0000-0000-000000000022', 'Lake House', '12 Lakeshore, Tahoe, CA 96145', 'short_term', 5, 3.5, 800, 0, 'active'),
    ('00000000-0000-0000-0000-000000000105', $1, '00000000-0000-0000-0000-000000000021', 'Oak Apartments 2A', '200 Oak St, Austin, TX 78701', 'long_term', 2, 1.0, 0, 1800, 'active'),
    ('00000000-0000-0000-0000-000000000106', $1, '00000000-0000-0000-0000-000000000022', 'Oak Apartments 3B', '200 Oak St, Austin, TX 78701', 'long_term', 1, 1.0, 0, 1200, 'active')
  ON CONFLICT DO NOTHING`, [CID]);

  // Bookings
  await sql.query(`INSERT INTO bookings (id, company_id, property_id, guest_name, guest_email, guest_phone, guest_address, start_date, end_date, nightly_rate, status, total_amount, source, reservation_number, commission_rate) VALUES
    ('00000000-0000-0000-0000-000000000201', $1, '00000000-0000-0000-0000-000000000101', 'Lisa Thompson', 'lisa@email.com', '555-0123', '12 Cedar St, Austin, TX 78701', '2026-07-10', '2026-07-17', 450, 'checked-in', 3150, 'direct', '1472', 0.15),
    ('00000000-0000-0000-0000-000000000202', $1, '00000000-0000-0000-0000-000000000101', 'Maria Kim', 'maria@email.com', NULL, '450 Beach Dr, Miami, FL 33139', '2026-08-01', '2026-08-08', 450, 'confirmed', 3150, 'airbnb', '2853', 0.25),
    ('00000000-0000-0000-0000-000000000203', $1, '00000000-0000-0000-0000-000000000101', 'John Davis', 'john@email.com', NULL, '890 Pine Rd, Denver, CO 80205', '2026-08-15', '2026-08-22', 475, 'confirmed', 3325, 'booking.com', '3691', 0.20),
    ('00000000-0000-0000-0000-000000000204', $1, '00000000-0000-0000-0000-000000000102', 'Emily Rodriguez', 'emily@email.com', '555-0345', NULL, '2026-08-01', '2026-08-06', 650, 'confirmed', 3250, 'direct', '5713', 0.15),
    ('00000000-0000-0000-0000-000000000205', $1, '00000000-0000-0000-0000-000000000102', 'Tom Baker', 'tom@email.com', '555-0456', NULL, '2026-09-01', '2026-09-07', 650, 'confirmed', 3900, 'vrbo', '8924', 0.18)
  ON CONFLICT DO NOTHING`, [CID]);

  // Tenants
  await sql.query(`INSERT INTO tenants (id, company_id, property_id, name, email, phone, address, lease_start, lease_end, monthly_rent, security_deposit, status) VALUES
    ('00000000-0000-0000-0000-000000000301', $1, '00000000-0000-0000-0000-000000000105', 'Alex Rivera', 'alex@email.com', '555-0678', '200 Oak St #2A, Austin, TX 78701', '2026-01-01', '2026-12-31', 1800, 1800, 'active'),
    ('00000000-0000-0000-0000-000000000302', $1, '00000000-0000-0000-0000-000000000106', 'Jordan Lee', 'jordan@email.com', '555-0789', '200 Oak St #3B, Austin, TX 78701', '2026-03-01', '2027-02-28', 1200, 1200, 'active')
  ON CONFLICT DO NOTHING`, [CID]);

  // Payment methods
  await sql.query(`INSERT INTO payment_methods (id, company_id, method_type, label, card_last4, card_expiry, card_brand, bank_name, account_type, account_last4, routing_last4, is_default) VALUES
    ('00000000-0000-0000-0000-000000000401', $1, 'credit_card', 'Visa ••••4242', '4242', '12/27', 'visa', NULL, NULL, NULL, NULL, true),
    ('00000000-0000-0000-0000-000000000402', $1, 'ach', 'Chase Checking ••••6789', NULL, NULL, NULL, 'Chase', 'checking', '6789', '0210', false)
  ON CONFLICT DO NOTHING`, [CID]);

  // Payments
  await sql.query(`INSERT INTO payments (id, company_id, booking_id, property_id, payment_type, method, amount_cents, description, status) VALUES
    ('00000000-0000-0000-0000-000000000501', $1, '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', 'charge', 'credit_card', 315000, 'Full stay payment', 'completed'),
    ('00000000-0000-0000-0000-000000000502', $1, '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000101', 'deposit', 'credit_card', 100000, 'Booking deposit', 'completed'),
    ('00000000-0000-0000-0000-000000000503', $1, '00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000101', 'charge', 'ach', 332500, 'Full stay payment', 'pending')
  ON CONFLICT DO NOTHING`, [CID]);

  // Maintenance
  await sql.query(`INSERT INTO maintenance_requests (id, company_id, property_id, title, description, priority, status) VALUES
    ('00000000-0000-0000-0000-000000000601', $1, '00000000-0000-0000-0000-000000000101', 'AC not cooling', 'Guest reports AC unit not cooling below 78F', 'high', 'open'),
    ('00000000-0000-0000-0000-000000000602', $1, '00000000-0000-0000-0000-000000000103', 'Leaky faucet', 'Kitchen faucet dripping', 'medium', 'in-progress'),
    ('00000000-0000-0000-0000-000000000603', $1, '00000000-0000-0000-0000-000000000105', 'Garbage disposal broken', 'Tenant reported disposal not working', 'medium', 'open')
  ON CONFLICT DO NOTHING`, [CID]);

  // Vendors
  await sql.query(`INSERT INTO vendor_contacts (id, company_id, name, contact_type, phone, email) VALUES
    ('00000000-0000-0000-0000-000000000701', $1, 'ABC Plumbing', 'plumber', '555-1001', 'abc@plumbing.com'),
    ('00000000-0000-0000-0000-000000000702', $1, 'Cool Air HVAC', 'hvac', '555-1002', 'service@coolair.com'),
    ('00000000-0000-0000-0000-000000000703', $1, 'Green Lawn Care', 'landscaping', '555-1003', 'green@lawn.com')
  ON CONFLICT DO NOTHING`, [CID]);

  // Tax
  await sql.query(`INSERT INTO tax_settings (id, company_id, name, rate, tax_type, applies_to) VALUES
    ('00000000-0000-0000-0000-000000000801', $1, 'Lodging Tax', 0.12, 'lodging', 'short_term'),
    ('00000000-0000-0000-0000-000000000802', $1, 'Sales Tax', 0.0825, 'sales', 'both')
  ON CONFLICT DO NOTHING`, [CID]);

  console.log('SEED COMPLETE');

  const counts = await sql.query(`SELECT 
    (SELECT count(*) FROM companies) as companies,
    (SELECT count(*) FROM users) as users,
    (SELECT count(*) FROM properties) as properties,
    (SELECT count(*) FROM bookings) as bookings,
    (SELECT count(*) FROM tenants) as tenants,
    (SELECT count(*) FROM payment_methods) as pms,
    (SELECT count(*) FROM payments) as payments`);
  console.log('COUNTS:', JSON.stringify(counts[0]));
}

seed().catch(e => console.error('SEED ERROR:', e.message));
