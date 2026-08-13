import { createFileRoute } from "@tanstack/react-router";
import { PublicShell, useSeo, CtaButton, BRAND } from "~/lib/public-page";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — RentMore | Property Management Software" },
      {
        name: "description",
        content:
          "Simple, transparent pricing for property managers running short-term and long-term rentals. Starter $49/mo, Growth $149/mo, Pro $349/mo, Enterprise from $499/mo. No long-term contracts.",
      },
    ],
  }),
  component: PricingPage,
});

const TIERS = [
  { name: "Starter", price: "$49", units: "Up to 10 units", highlight: false, desc: "For small landlords getting organized — one platform for rent, guests, and leases." },
  { name: "Growth", price: "$149", units: "Up to 30 units", highlight: true, desc: "For growing managers with a real mix of short-term and long-term properties." },
  { name: "Pro", price: "$349", units: "Up to 75 units", highlight: false, desc: "For established management companies with bigger portfolios and teams." },
  { name: "Enterprise", price: "From $499", units: "75+ units", highlight: false, desc: "For larger operations. Contact us to scope your portfolio." },
];

function PricingPage() {
  useSeo(
    "Pricing — RentMore | Property Management Software",
    "Simple, transparent pricing for property managers running short-term and long-term rentals. Starter $49/mo, Growth $149/mo, Pro $349/mo, Enterprise from $499/mo. No long-term contracts."
  );

  return (
    <PublicShell>
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <p className="text-sm font-medium uppercase tracking-wide mb-4" style={{ color: BRAND }}>Pricing</p>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight mb-6">
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-10">
          One price per month, per portfolio — no per-unit fees, no long-term contracts, no setup charges.
          Cancel anytime.
        </p>
        <p className="text-sm text-gray-500 max-w-2xl mx-auto">
          Every plan includes the full platform: online payments, tenant &amp; guest management, maintenance,
          lease &amp; reservation tracking, owner payouts, and reports. Plans differ only in portfolio size.
        </p>
      </section>

      {/* Tier cards */}
      <section className="pb-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`rounded-xl p-6 border shadow-sm flex flex-col ${
                  tier.highlight ? "border-2 bg-white relative" : "border-gray-100 bg-white"
                }`}
                style={tier.highlight ? { borderColor: BRAND } : {}}
              >
                {tier.highlight && (
                  <span
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: BRAND }}
                  >
                    Most popular
                  </span>
                )}
                <h2 className="text-lg font-semibold text-gray-900 mb-1">{tier.name}</h2>
                <p className="text-3xl font-bold text-gray-900 mb-1">
                  {tier.price}
                  <span className="text-lg font-normal text-gray-400">/mo</span>
                </p>
                <p className="text-sm font-medium text-gray-500 mb-2">{tier.units}</p>
                <p className="text-xs text-gray-500 leading-relaxed mb-6 flex-1">{tier.desc}</p>
                <a
                  href="/signup"
                  className={`block text-center py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    tier.highlight
                      ? "text-white hover:opacity-90"
                      : "border border-gray-200 text-gray-700 hover:border-gray-300"
                  }`}
                  style={tier.highlight ? { backgroundColor: BRAND } : {}}
                >
                  Start free trial
                </a>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-400 mt-8">
            Guests pay a 3.5% card convenience fee &nbsp;|&nbsp; 1% + $0.25 on ACH — you pay nothing
          </p>
        </div>
      </section>

      {/* What's included */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">What's included on every plan</h2>
          <ul className="space-y-3 text-sm text-gray-600">
            {[
              "Online rent & booking payments — credit card and ACH, with paid / pending / overdue tracking",
              "Tenant & guest management — long-term tenants and short-term guests in one place",
              "Maintenance request tracking with priority, status, and assignee",
              "Lease and reservation tracking with a portfolio calendar",
              "Owner payout calculations and statements (ACH or check method per payout)",
              "Financial reports, guest activity runs, tax reports, and processing-fee breakdowns",
              "Integrations tab with OTA (Airbnb, Booking.com, Vrbo) architecture built in",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                {item}
              </li>
            ))}
          </ul>
          <div className="text-center mt-10">
            <CtaButton href="/signup" label="Start your free trial" />
            <p className="text-xs text-gray-400 mt-4">
              Prefer to see it first? <a href="/pitch" className="underline" style={{ color: BRAND }}>Read the product overview</a>.
            </p>
          </div>
        </div>
      </section>

      {/* How fees work */}
      <section className="py-16">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">How transaction fees work</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            RentMore processes payments through your own Stripe account — RentMore is never the merchant of
            record and never holds your funds. Guests pay a 3.5% convenience fee on card payments and 1% + $0.25 on ACH — you
            receive 100% of every booking, nothing is deducted from your proceeds. The Reports tab breaks the
            fees out per transaction.
          </p>
          <p className="text-gray-600 leading-relaxed mb-4">
            Owner payouts are calculated automatically and recorded in the platform; you disburse them from
            your own bank account via ACH or paper check, per each owner's preference.
          </p>
          <p className="text-sm text-gray-500">
            Not sure which tier fits? If you manage a mix of vacation rentals and annual leases,{" "}
            <a href="/property-management-software" className="underline" style={{ color: BRAND }}>
              this guide to software for mixed portfolios
            </a>{" "}
            may help.
          </p>
        </div>
      </section>
    </PublicShell>
  );
}
