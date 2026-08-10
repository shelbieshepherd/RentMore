// Shared fee calculations — single source of truth for payments + reports

export type PaymentMethod = "credit card" | "ACH" | "check" | "utility" | "deposit" | "refund" | string;

/**
 * Processing fee for a payment method.
 * - Credit card: 2.9% + $0.30
 * - ACH: 1% + $0.25
 * - All others (check, utility, deposit, refund): $0
 * Returns cents (integer) for consistency.
 */
export function processingFee(amount: number, method: PaymentMethod): number {
  if (method === "credit card") return Math.round(amount * 0.029 + 30);
  if (method === "ACH") return Math.round(amount * 0.01 + 25);
  return 0;
}

export function processingFeeLabel(method: PaymentMethod): string {
  if (method === "credit card") return "Processing Fee (2.9% + $0.30)";
  if (method === "ACH") return "Processing Fee (1% + $0.25)";
  return "No processing fee";
}
