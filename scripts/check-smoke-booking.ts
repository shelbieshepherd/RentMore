import { neon } from "@neondatabase/serverless";
const url = (process.env.DATABASE_URL || "").replace(/['"]/g, "");
const sql = neon(url);

async function main() {
  const companyId = "7e37203a-6c46-4e39-8be8-c3116a798574";
  const bookingId = "11e968fc-036b-42b7-90c8-ef92cd0b618a";

  const booking = await sql`SELECT * FROM bookings WHERE id = ${bookingId}::uuid`;
  console.log("BOOKING:", JSON.stringify(booking, null, 2));

  const pms = await sql`
    SELECT * FROM payment_methods
    WHERE company_id = ${companyId}::uuid
    ORDER BY created_at DESC`;
  console.log("PAYMENT_METHODS for company:", JSON.stringify(pms, null, 2));

  const methodsForBooking = await sql`
    SELECT * FROM payment_methods WHERE booking_id = ${bookingId}::uuid`;
  console.log("PAYMENT_METHODS for booking:", JSON.stringify(methodsForBooking, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
