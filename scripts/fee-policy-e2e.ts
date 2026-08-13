// Fee model v2 (owner decision Aug 13, FINAL) — policy + fee-math E2E.
// RentMore takes ZERO transaction fee; the entire guest-paid convenience fee
// after Stripe's processing cost goes to the company using RentMore.
//   Card: guest charged = B × 1.035; Stripe = 2.9% × guest total + $0.30;
//         PM receives = guest total − Stripe cost (= B + residual).
//   ACH:  guest charged = B + 1% + $0.25; Stripe ACH = 0.8% of guest total,
//         capped at $5.00; PM receives = guest total − Stripe cost.
// Reference (card, B=$1,000): guest $1,035.00, Stripe $30.32, PM $1,004.68.
import { depositFor, balanceDueDate, depositRemainderCents } from "/home/team/shared/site/src/lib/payment-policy";
import {
  convenienceFeeCents,
  guestTotalCents,
  stripeFeeCents,
  pmNetCents,
} from "/home/team/shared/site/src/lib/fees";
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (cond) { pass++; console.log("PASS ", name); } else { fail++; console.log("FAIL ", name, extra); } };
// Deposit: $500 per 7-day block, ceil
ok("1 night → 1 block = $500", depositFor(1) === 50000, String(depositFor(1)));
ok("7 nights → 1 block = $500", depositFor(7) === 50000);
ok("8 nights → 2 blocks = $1000", depositFor(8) === 100000, String(depositFor(8)));
ok("14 nights → 2 blocks = $1000", depositFor(14) === 100000);
ok("15 nights → 3 blocks = $1500", depositFor(15) === 150000);
ok("0/invalid → 0", depositFor(0) === 0 && depositFor(-3) === 0 && depositFor(NaN) === 0);
// Balance due: check-in minus 30 days
ok("30d before checkin", balanceDueDate("2026-09-15") === "2026-08-16", balanceDueDate("2026-09-15"));
ok("month boundary", balanceDueDate("2026-08-01") === "2026-07-02", balanceDueDate("2026-08-01"));
ok("invalid date → empty", balanceDueDate("garbage") === "");
// Remainder
ok("total $2000, 8 nights → remainder $1000", depositRemainderCents(200000, 8) === 100000);
ok("total $1500, 7 nights → remainder $1000", depositRemainderCents(150000, 7) === 100000);
// Fees — guest-paid convenience model, ZERO platform fee (owner Aug 13 FINAL):
//   Card: guest charged = B × 1.035; Stripe = 2.9%×(B×1.035) + $0.30; PM nets
//         guest − Stripe = B + residual. RentMore application fee = $0 (never set).
//   ACH:  guest charged = B + 1% + $0.25; Stripe ACH = 0.8% of guest total,
//         capped $5; PM nets guest − Stripe.
// $1,000 reference (card): guest $1,035.00, Stripe $30.32, PM $1,004.68
ok("card $1000 guest total = 103500", guestTotalCents(100000, "credit card") === 103500, String(guestTotalCents(100000, "credit card")));
ok("card $1000 convenience fee = 3500", convenienceFeeCents(100000, "credit card") === 3500);
ok("card $1000 stripe = 3032", stripeFeeCents(103500, "credit card") === 3032, String(stripeFeeCents(103500, "credit card")));
ok("card $1000 pm net = 100468 (B + 4.68 residual)", pmNetCents(100000, "credit card") === 100468, String(pmNetCents(100000, "credit card")));
ok("card $1000 residual = 468", pmNetCents(100000, "credit card") - 100000 === 468);
// $500 deposit reference (card) — owner's live smoke-test expectation:
// guest $517.50, Stripe $15.31, PM nets $502.19, RentMore $0
ok("card $500 guest = 51750", guestTotalCents(50000, "credit card") === 51750);
ok("card $500 stripe = 1531", stripeFeeCents(51750, "credit card") === 1531, String(stripeFeeCents(51750, "credit card")));
ok("card $500 pm net = 50219", pmNetCents(50000, "credit card") === 50219, String(pmNetCents(50000, "credit card")));
ok("card $500 residual = 219 (≥ 0)", pmNetCents(50000, "credit card") - 50000 === 219);
// small-ticket edge (card): $10 → convenience 35, stripe 0.60 → pm net 975;
// residual negative, but the PM-net amount still clamps ≥ 0 (never negative)
ok("card $10 pm net clamped ≥ 0", pmNetCents(1000, "credit card") === 975, String(pmNetCents(1000, "credit card")));
// ACH $1,000: guest $1,010.25, stripe $5.00 (capped) → PM nets $1,005.25
ok("ACH $1000 guest = 101025", guestTotalCents(100000, "ACH") === 101025, String(guestTotalCents(100000, "ACH")));
ok("ACH $1000 convenience = 1025", convenienceFeeCents(100000, "ACH") === 1025);
ok("ACH $1000 stripe capped = 500", stripeFeeCents(101025, "ACH") === 500, String(stripeFeeCents(101025, "ACH")));
ok("ACH $1000 pm net = 100525", pmNetCents(100000, "ACH") === 100525, String(pmNetCents(100000, "ACH")));
// ACH $100: guest $101.25, stripe min(81,500)=81 → PM nets $100.44
ok("ACH $100 guest = 10125", guestTotalCents(10000, "ACH") === 10125);
ok("ACH $100 pm net = 10044", pmNetCents(10000, "ACH") === 10044, String(pmNetCents(10000, "ACH")));
// small-ticket edge (ACH): $10 → guest $10.35, stripe 0.08 → PM nets $10.27
ok("ACH $10 pm net = 1027", pmNetCents(1000, "ACH") === 1027, String(pmNetCents(1000, "ACH")));
// Identity: PM nets exactly booking + residual on both rails (residual = convenience − Stripe)
ok("card identity pmNet = guest − stripe", pmNetCents(100000, "credit card") === guestTotalCents(100000, "credit card") - stripeFeeCents(guestTotalCents(100000, "credit card"), "credit card"));
ok("ACH identity pmNet = guest − stripe", pmNetCents(100000, "ACH") === guestTotalCents(100000, "ACH") - stripeFeeCents(guestTotalCents(100000, "ACH"), "ACH"));
ok("check → 0 fees, pm net = amount", convenienceFeeCents(100000, "check") === 0 && pmNetCents(100000, "check") === 100000);
console.log(`\n=== policy/fees v2 (zero platform fee): ${pass} pass, ${fail} fail ===`);
process.exit(fail ? 1 : 0);
