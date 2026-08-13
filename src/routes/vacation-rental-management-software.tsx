import { createFileRoute } from "@tanstack/react-router";
import { PublicShell, useSeo, CtaButton, BRAND } from "~/lib/public-page";

export const Route = createFileRoute("/vacation-rental-management-software")({
  head: () => ({
    meta: [
      { title: "Vacation Rental Management Software: What to Look For | RentMore" },
      {
        name: "description",
        content:
          "A practical guide to vacation rental management software: the features that matter for property managers — online payments, guest management, maintenance, reservations, owner payouts, and reporting.",
      },
    ],
  }),
  component: VacationRentalArticle,
});

function VacationRentalArticle() {
  useSeo(
    "Vacation Rental Management Software: What to Look For | RentMore",
    "A practical guide to vacation rental management software: the features that matter for property managers — online payments, guest management, maintenance, reservations, owner payouts, and reporting."
  );

  return (
    <PublicShell>
      <article className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-sm font-medium uppercase tracking-wide mb-4" style={{ color: BRAND }}>Guide</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight mb-6">
          Vacation Rental Management Software: What Property Managers Should Look For
        </h1>
        <p className="text-gray-600 text-lg leading-relaxed mb-8">
          Managing vacation rentals means juggling a lot at once: bookings from multiple channels, guests
          arriving and departing every week, cleaning schedules, maintenance, and owner expectations about
          payouts. The right software should make that simpler — not add another dashboard to check.
        </p>

        <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-12">Start with the day-to-day, not the hype</h2>
        <p className="text-gray-600 leading-relaxed mb-4">
          Vacation rental platforms love to lead with channel managers and price optimization. Those are
          useful at scale — but the software only earns its keep if the basics are solid. Before comparing
          channel integrations, ask what a typical week looks like in the tool: recording a booking,
          collecting a deposit, logging a maintenance request, and running this month's owner statement.
        </p>
        <p className="text-gray-600 leading-relaxed mb-4">
          For most property managers, the core features that matter day in and day out are:
        </p>
        <ul className="space-y-3 text-sm text-gray-600 mb-4">
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span><strong>Online payments.</strong> Collect booking deposits and balances by credit card or ACH, with automatic paid / pending / overdue status tracking — no more chasing checks.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span><strong>Guest management.</strong> Guest records, stay history, and check-in / check-out tracking for every property.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span><strong>Reservations and a calendar.</strong> Reservation blocks with dates and rates, visible across your whole portfolio.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span><strong>Maintenance requests.</strong> Log issues with priority and status, assign them, and track them to resolution.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span><strong>Owner payouts.</strong> Clear per-owner statements — gross bookings minus fees — with ACH or check method per payout.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span><strong>Reporting.</strong> Guest activity runs, financial summaries, tax reports, and processing-fee breakdowns you can export.</span>
          </li>
        </ul>

        <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-12">Do you also manage long-term rentals?</h2>
        <p className="text-gray-600 leading-relaxed mb-4">
          Many property managers run a mixed portfolio — a few vacation homes plus some annual leases. If
          that's you, a vacation-rental-only tool leaves your long-term properties orphaned in a second
          system (or a spreadsheet). The alternative is a platform built for both, where leases and
          reservations live side by side, and rent and booking payments are recorded the same way. Our
          guide to <a href="/property-management-software" className="underline" style={{ color: BRAND }}>property management software for short-term and long-term rentals</a> walks through how mixed portfolios work in practice.
        </p>

        <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-12">Channel integrations: know the difference</h2>
        <p className="text-gray-600 leading-relaxed mb-4">
          Direct connections to Airbnb, Booking.com, and Vrbo are the endgame for vacation rental software —
          multi-calendar sync, reservation import, availability push. Those partnerships are granted
          selectively by the platforms, so most tools route through a channel manager instead. When you
          evaluate software, ask specifically: are the OTA integrations owned by the vendor or routed
          through someone else's infrastructure? The answer affects your costs and your control.
        </p>
        <p className="text-gray-600 leading-relaxed mb-4">
          RentMore's approach is to build direct OTA connectivity on its own architecture (the Integrations
          tab already contains the scaffolding for Airbnb, Booking.com, and Vrbo) and plug live credentials
          in as partnerships are granted.
        </p>

        <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-12">Pricing sanity check</h2>
        <p className="text-gray-600 leading-relaxed mb-4">
          Vacation rental software is usually priced per unit, per property, or per booking — costs that
          creep up as your portfolio grows. Before you commit, do the math at the size you actually expect
          in two years, not the size you are today. Also ask who pays the processing fees: some tools make
          their margin on a slice of every transaction, which you only notice after volume picks up. With
          RentMore, guests pay a 3.5% card convenience fee (1% + $0.25 on ACH) and you receive 100% of every
          booking — a flat monthly price with no transaction drag on your revenue is easier to budget than a
          per-unit ladder — see the{" "}
          <a href="/pricing" className="underline" style={{ color: BRAND }}>pricing page</a> for how that works out at different portfolio sizes.
        </p>

        <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-12">What a small manager should actually do</h2>
        <p className="text-gray-600 leading-relaxed mb-4">
          If you manage fewer than 50 units, the win isn't a sprawling enterprise suite — it's one system
          where payments, guests, maintenance, and owner money are all tracked, so nothing falls through the
          cracks between October's booking and April's tax report. Start free, put your real properties in,
          and see whether the daily work actually gets faster.
        </p>

        <div className="bg-gray-50 rounded-xl p-8 border border-gray-100 mt-12 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-3">See how RentMore handles vacation rentals</h2>
          <p className="text-sm text-gray-600 mb-6 max-w-xl mx-auto">
            RentMore is built by a working property manager for portfolios of 5–50 units across short-term
            and long-term rentals. We're an early-stage product — we'd rather you try it than take our word
            for it.
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
            Or start with the <a href="/pitch" className="underline" style={{ color: BRAND }}>product overview</a>, and compare with our guide to{" "}
            <a href="/short-term-rental-software" className="underline" style={{ color: BRAND }}>short-term rental software for property managers</a>.
          </p>
        </div>
      </article>
    </PublicShell>
  );
}
