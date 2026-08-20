// Free-ACH fee model tests (owner decision Aug 14, FINAL).
// ACH: guest pays EXACTLY the charge amount (no 1% + $0.25); PM absorbs
// Stripe's ACH cost (0.8%, capped at $5.00). Card: unchanged — guest pays 3.5%.
// RentMore takes $0 on both rails.
import { describe, test, expect } from "bun:test";
import {
  convenienceFeeCents, guestTotalCents, stripeFeeCents, pmNetCents,
  CARD_CONVENIENCE_RATE, CARD_STRIPE_RATE, CARD_STRIPE_FLAT_CENTS,
  ACH_STRIPE_RATE, ACH_STRIPE_CAP_CENTS,
} from "./fees";

describe("FREE ACH — $2,000 rent (owner example)", () => {
  const amount = 200000;
  test("guest pays EXACTLY $2,000.00 (no fee)", () => {
    expect(convenienceFeeCents(amount, "ACH")).toBe(0);
    expect(guestTotalCents(amount, "ACH")).toBe(200000);
  });
  test("Stripe ACH cost = 0.8% capped at $5 → $5.00", () => {
    expect(stripeFeeCents(200000, "ACH")).toBe(500);
    expect(stripeFeeCents(200000, "ACH")).toBe(Math.min(Math.round(200000 * ACH_STRIPE_RATE), ACH_STRIPE_CAP_CENTS));
  });
  test("PM nets $1,995.00 (= amount − $5)", () => {
    expect(pmNetCents(amount, "ACH")).toBe(199500);
  });
  test("RentMore keeps $0 (guest total − pmNet = Stripe cost)", () => {
    expect(guestTotalCents(amount, "ACH") - pmNetCents(amount, "ACH")).toBe(500);
  });
});

describe("FREE ACH — $150 utility on-demand (0.8% uncapped = $1.20)", () => {
  const amount = 15000;
  test("guest pays exactly $150.00", () => {
    expect(guestTotalCents(amount, "ACH")).toBe(15000);
  });
  test("Stripe cost = $1.20 (below cap)", () => {
    expect(stripeFeeCents(guestTotalCents(amount, "ACH"), "ACH")).toBe(120);
  });
  test("PM nets $148.80 (amount − 1.20)", () => {
    expect(pmNetCents(amount, "ACH")).toBe(14880);
  });
  test("RentMore keeps $0", () => {
    expect(guestTotalCents(amount, "ACH") - pmNetCents(amount, "ACH")).toBe(120);
  });
});

describe("Card UNCHANGED — 3.5% guest convenience fee", () => {
  const amount = 100000;
  test("guest pays $1,035.00", () => {
    expect(convenienceFeeCents(amount, "credit card")).toBe(3500);
    expect(convenienceFeeCents(amount, "credit card")).toBe(Math.round(amount * CARD_CONVENIENCE_RATE));
    expect(guestTotalCents(amount, "credit card")).toBe(103500);
  });
  test("Stripe cost = $30.32", () => {
    expect(stripeFeeCents(103500, "credit card")).toBe(Math.round(103500 * CARD_STRIPE_RATE) + CARD_STRIPE_FLAT_CENTS);
  });
  test("PM nets $1,004.68 (amount + leftover)", () => {
    expect(pmNetCents(amount, "credit card")).toBe(100468);
  });
  test("RentMore keeps $0", () => {
    expect(guestTotalCents(amount, "credit card") - stripeFeeCents(103500, "credit card") - pmNetCents(amount, "credit card")).toBe(0);
  });
});

describe("Card — $250 on-demand charge unchanged", () => {
  const amount = 25000;
  test("guest $258.75, PM $250.95, RentMore $0", () => {
    expect(guestTotalCents(amount, "credit card")).toBe(25875);
    expect(pmNetCents(amount, "credit card")).toBe(25095);
    expect(guestTotalCents(amount, "credit card") - stripeFeeCents(25875, "credit card") - pmNetCents(amount, "credit card")).toBe(0);
  });
});

describe("Fee clamp / invariants", () => {
  test("ACH guest == amount even at $0.01", () => {
    expect(guestTotalCents(1, "ACH")).toBe(1);
  });
  test("card guest >= amount at $0.01", () => {
    expect(guestTotalCents(1, "credit card")).toBeGreaterThanOrEqual(1);
  });
  test("check/no-fee method == amount", () => {
    expect(guestTotalCents(100, "check")).toBe(100);
  });
  test("PM nets LESS than charge on ACH (absorbs cost) — not more", () => {
    expect(pmNetCents(200000, "ACH")).toBeLessThan(200000);
  });
});
