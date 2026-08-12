// RentMore payment policy — single source of truth for short-term booking payments.
//
// Policy (owner direction, business plan):
//  - $500 non-refundable deposit per 7-day block, due at booking (e.g. 8 nights = 2 blocks = $1,000)
//  - Remaining balance due 30 days before check-in; remainder is subject to the cancellation policy
//  - Deposits are non-refundable
//
// All amounts are integer cents for consistency with the payments table and Stripe.

export const DEPOSIT_PER_BLOCK_CENTS = 50000; // $500.00 per 7-day block
export const BLOCK_NIGHTS = 7;
export const BALANCE_DUE_DAYS_BEFORE_CHECKIN = 30;

/** Non-refundable deposit for a stay of `nights` nights: $500 per full or partial 7-day block. */
export function depositFor(nights: number): number {
  if (!Number.isFinite(nights) || nights <= 0) return 0;
  return Math.ceil(nights / BLOCK_NIGHTS) * DEPOSIT_PER_BLOCK_CENTS;
}

/** Date (YYYY-MM-DD) the remaining balance is due: check-in minus 30 days. */
export function balanceDueDate(checkin: string | Date): string {
  const d =
    checkin instanceof Date
      ? new Date(checkin)
      : new Date(checkin.length === 10 ? `${checkin}T00:00:00Z` : checkin);
  if (isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() - BALANCE_DUE_DAYS_BEFORE_CHECKIN);
  return d.toISOString().slice(0, 10);
}

/** Remaining balance after the deposit: total minus deposit (subject to cancellation policy). */
export function depositRemainderCents(totalAmountCents: number, nights: number): number {
  return totalAmountCents - depositFor(nights);
}
