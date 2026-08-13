// Shared fee calculations — single source of truth for payments + reports
//
// Fee model (owner decision, Aug 13): Streamline-style guest-paid convenience
// fees on BOTH rails. The guest pays a convenience fee on top of the booking
// amount; the PM nets 100% of the booking; RentMore keeps the spread after
// Stripe's processing cost (application_fee_amount).
//   - Card: guest +3.5% (Stripe cost 2.9% + $0.30)
//   - ACH:  guest +1% + $0.25 (Stripe ACH cost 0.8%, capped at $5.00)
export type PaymentMethod = "credit card" | "ACH" | "check" | "utility" | "deposit" | "refund" | string;

export const CARD_CONVENIENCE_RATE = 0.035; // guest pays +3.5% on card
export const CARD_STRIPE_RATE = 0.029; // Stripe card cost 2.9%
export const CARD_STRIPE_FLAT_CENTS = 30; // + $0.30
export const ACH_CONVENIENCE_RATE = 0.01; // guest pays +1% on ACH
export const ACH_CONVENIENCE_FLAT_CENTS = 25; // + $0.25
export const ACH_STRIPE_RATE = 0.008; // Stripe ACH cost 0.8% (real rate, stripe.com/pricing)
export const ACH_STRIPE_CAP_CENTS = 500; // capped at $5.00

/** Guest-paid convenience fee on top of the booking amount (cents). */
export function convenienceFeeCents(amount: number, method: PaymentMethod): number {
  if (method === "ACH") return Math.round(amount * ACH_CONVENIENCE_RATE) + ACH_CONVENIENCE_FLAT_CENTS;
  if (method === "credit card") return Math.round(amount * CARD_CONVENIENCE_RATE);
  return 0;
}
/** Total charged to the guest = booking amount + convenience fee (cents). */
export function guestTotalCents(amount: number, method: PaymentMethod): number {
  return amount + convenienceFeeCents(amount, method);
}
/** Stripe's processing cost on the guest total (cents). */
export function stripeFeeCents(guestTotal: number, method: PaymentMethod): number {
  if (method === "ACH") return Math.min(Math.round(guestTotal * ACH_STRIPE_RATE), ACH_STRIPE_CAP_CENTS);
  if (method === "credit card") return Math.round(guestTotal * CARD_STRIPE_RATE) + CARD_STRIPE_FLAT_CENTS;
  return 0;
}
/**
 * RentMore platform fee (application_fee_amount): the spread after Stripe's
 * cost, clamped ≥ 0. PM receives exactly the booking amount on both rails.
 */
export function platformFeeCents(amount: number, method: PaymentMethod): number {
  if (method !== "credit card" && method !== "ACH") return 0;
  const guest = guestTotalCents(amount, method);
  return Math.max(guest - amount - stripeFeeCents(guest, method), 0);
}
/**
 * Processing fee for a payment method (cents).
 * Card: guest pays 3.5%, RentMore keeps the spread after Stripe (2.9% + $0.30).
 * ACH:  guest pays 1% + $0.25, RentMore keeps the spread after Stripe (0.8%, $5 cap).
 * All others (check, utility, deposit, refund): $0.
 * PM always nets 100% of the booking amount — the fee is guest-paid.
 */
export function processingFee(amount: number, method: PaymentMethod): number {
  return platformFeeCents(amount, method);
}
export function processingFeeLabel(method: PaymentMethod): string {
  if (method === "credit card") return "3.5% card convenience fee (guest pays)";
  if (method === "ACH") return "ACH convenience fee (1% + $0.25, guest pays)";
  return "No convenience fee";
}
export function convenienceFeeLabel(method: PaymentMethod): string {
  return processingFeeLabel(method);
}
