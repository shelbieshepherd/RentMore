import { createFileRoute } from "@tanstack/react-router";
import { PublicShell, useSeo, CtaButton, BRAND, seoHead } from "~/lib/public-page";

export const Route = createFileRoute("/property-management-software")({
  head: () =>
    seoHead(
      "Property Management Software for Short-Term and Long-Term Rentals | RentMore",
      "How to choose property management software when you run both short-term and long-term rentals — and why a single platform for leases, reservations, payments, and owner payouts beats juggling two tools.",
      "/property-management-software",
    ),
  component: MixedPortfolioArticle,
});

function MixedPortfolioArticle() {
  useSeo(
    "Property Management Software for Short-Term and Long-Term Rentals | RentMore",
    "How to choose property management software when you run both short-term and long-term rentals — and why a single platform for leases, reservations, payments, and owner payouts beats juggling two tools."
  );

  return (
    <PublicShell>
      <article className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-sm font-medium uppercase tracking-wide mb-4" style={{ color: BRAND }}>Guide</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight mb-6">
          Property Management Software for Short-Term and Long-Term Rentals
        </h1>
        <p className="text-gray-600 text-lg leading-relaxed mb-8">
          Most property management software is built for one world or the other: vacation rental platforms
          that assume every unit turns over weekly, and landlord suites that assume multi-year leases. But a
          huge share of managers run both — a couple of seasonal cabins, a few annual rentals, maybe a
          unit that switches between the two. That's exactly where generic tools start to pinch.
        </p>

        <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-12">Why mixed portfolios need a different setup</h2>
        <p className="text-gray-600 leading-relaxed mb-4">
          With two tools, the same property exists twice: once as a reservation calendar, once as a lease
          record. Payments land in different reports. Owners get statements in different formats. And every
          month, someone reconciles the two by hand. The cost isn't the software — it's the reconciliation.
        </p>
        <p className="text-gray-600 leading-relaxed mb-4">
          A platform built for both removes that. One property record holds its type, rate, and details.
          Leases and reservations live on the same calendar. Rent payments and booking deposits are
          recorded the same way, with the same status tracking. Owner payouts and reports cover the whole
          portfolio, not just one side of it.
        </p>

        <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-12">The feature set that holds both worlds</h2>
        <p className="text-gray-600 leading-relaxed mb-4">Whatever tool you evaluate, these are the capabilities that make a mixed portfolio manageable in one place:</p>
        <ul className="space-y-3 text-sm text-gray-600 mb-4">
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span><strong>One property profile per unit.</strong> Type (short-term or long-term), address, rent or nightly rate, and unit details — with lease dates or reservation blocks attached.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span><strong>Unified payment tracking.</strong> Card and ACH payments for both rent and bookings, with paid / pending / overdue status — one place to see what's coming in.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span><strong>Tenants and guests side by side.</strong> Long-term tenants with lease records, short-term guests with stays — managed in the same system.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span><strong>Maintenance across the portfolio.</strong> Requests with priority, status, and assignee, whether the unit turns over weekly or yearly.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span><strong>Owner payouts that don't care about rental type.</strong> Per-owner statements with gross revenue minus fees, paid by ACH or check per the owner's preference.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span><strong>Reports that span the portfolio.</strong> Guest activity runs, financial summaries, tax reports, and processing-fee breakdowns — exportable.</span>
          </li>
        </ul>

        <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-12">Payments and owner payouts: the two questions that matter</h2>
        <p className="text-gray-600 leading-relaxed mb-4">
          Two structural questions separate platforms for mixed portfolios. First, <strong>who is the merchant
          of record?</strong> Some platforms collect rent and booking money into their own accounts and pay you out
          later — which puts your cash flow on their schedule. The alternative is processing through your own
          account, so funds move on your timeline. RentMore uses your own Stripe account: RentMore is never
          the merchant of record and never holds your funds.
        </p>
        <p className="text-gray-600 leading-relaxed mb-4">
          Second, <strong>how do owners get paid?</strong> Fully automated transfers to owners require each owner to
          onboard to a payments platform — a real barrier for some owner relationships. The pragmatic
          middle ground (which RentMore uses) is full automation of the calculation, statement, and record
          keeping, while you disburse from your own bank via ACH or paper check per owner preference.
        </p>

        <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-12">What about OTA connectivity?</h2>
        <p className="text-gray-600 leading-relaxed mb-4">
          If your short-term side lists on Airbnb, Booking.com, or Vrbo, you'll eventually want channel
          connectivity: calendar sync, reservation import, availability push. Because the platforms grant
          direct API partnerships selectively, most software resells a channel manager. RentMore's approach
          is to build its own OTA architecture — the Integrations tab already contains the scaffolding for
          all three platforms — and activate live credentials as partnerships are granted.
        </p>

        <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-12">Start with your own numbers</h2>
        <p className="text-gray-600 leading-relaxed mb-4">
          Whatever you choose, evaluate it on your own portfolio: load your actual properties, record a
          real payment, run a statement. If the tool makes your Monday-morning reconciliation faster, it's
          working. For more on the short-term side, see our guide to{" "}
          <a href="/short-term-rental-software" className="underline" style={{ color: BRAND }}>short-term rental software for property managers</a>; for the
          vacation side, <a href="/vacation-rental-management-software" className="underline" style={{ color: BRAND }}>vacation rental management software: what to look for</a>.
        </p>

        <div className="bg-gray-50 rounded-xl p-8 border border-gray-100 mt-12 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-3">One platform for both sides of your portfolio</h2>
          <p className="text-sm text-gray-600 mb-6 max-w-xl mx-auto">
            RentMore is built by a working property manager for mixed portfolios of 5–50 units. Early-stage,
            deeply focused — and free to try on your real properties.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <CtaButton href="/signup" label="Get started" />
            <a
              href="/pricing"
              className="px-8 py-3.5 rounded-lg text-base font-medium text-gray-700 border border-gray-200 hover:border-gray-300 transition-colors"
            >
              See pricing
            </a>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            New here? <a href="/pitch" className="underline" style={{ color: BRAND }}>Read the product overview</a> first.
          </p>
        </div>
      </article>
    </PublicShell>
  );
}
