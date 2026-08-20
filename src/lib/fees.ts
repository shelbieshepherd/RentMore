// Shared fee calculations — single source of truth for payments + reports
//
// Fee model — FINAL (owner decisions Aug 13 + Aug 14):
//   RentMore takes ZERO transaction fee on both rails — revenue is
//   subscription-only (application_fee_amount is never set).
//
//   Card (Aug 13, FINAL): Streamline-style guest-paid convenience fee.
//     The guest pays the charge + 3.5% on top; after Stripe's cost
//     (2.9% + $0.30) the ENTIRE leftover goes to the PM. RentMore $0.
//     E.g. $1,000: guest $1,035.00, Stripe $30.32, PM $1,004.68.
//
//   ACH (Aug 14, FINAL — FREE ACH): the guest pays EXACTLY the charge amount —
//     NO convenience fee to the guest, ever. Stripe's ACH cost (0.8%, capped at
//     $5.00) is absorbed by the PM, i.e. deducted from the PM's net.
//     E.g. $2,000 ACH: guest pays $2,000.00, Stripe $5.00, PM nets $1,995.00.
//     RentMore $0.
export type PaymentMethod = "credit card" | "ACH" | "check" | "utility" | "deposit" | "refund" | string;
export const CARD_CONVENIENCE_RATE = 0.035; // guest pays +3.5% on card
export const CARD_STRIPE_RATE = 0.029; // Stripe card cost 2.9%
export const CARD_STRIPE_FLAT_CENTS = 30; // + $0.30
// FREE ACH (owner Aug 14): the guest pays NO convenience fee on ACH. These are
// set to 0 so convenienceFeeCents/guestTotalCents return the charge amount
// unchanged; the PM absorbs Stripe's ACH cost (see pmNetCents).
export const ACH_CONVENIENCE_RATE = 0; // guest pays +0% on ACH (PM absorbs)
export const ACH_CONVENIENCE_FLAT_CENTS = 0; // no flat fee on ACH
export const ACH_STRIPE_RATE = 0.008; // Stripe ACH cost 0.8% (real rate, stripe.com/pricing)
export const ACH_STRIPE_CAP_CENTS = 500; // capped at $5.00
/** Guest-paid convenience fee on top of the booking amount (cents). */
export function convenienceFeeCents(amount: number, method: PaymentMethod): number {
  if (method === "ACH") return Math.round(amount * ACH_CONVENIENCE_RATE) + ACH_CONVENIENCE_FLAT_CENTS; // = 0 (free ACH)
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
 * What the PM receives (cents):
 *   - Card: guest total − Stripe cost = charge amount PLUS the convenience-fee
 *     leftover. RentMore keeps nothing.
 *   - ACH (free ACH): the guest pays exactly the charge amount; the PM absorbs
 *     Stripe's ACH cost, so PM nets = charge amount − Stripe ACH cost.
 */
export function pmNetCents(amount: number, method: PaymentMethod): number {
  const guest = guestTotalCents(amount, method);
  return guest - stripeFeeCents(guest, method);
}
export function processingFeeLabel(method: PaymentMethod): string {
  if (method === "credit card") return "3.5% card convenience fee (guest pays)";
  if (method === "ACH") return "Free ACH — you (the PM) absorb Stripe's ACH cost (0.8%, capped at $5)";
  return "No convenience fee";
}
export function convenienceFeeLabel(method: PaymentMethod): string {
  return processingFeeLabel(method);
}
