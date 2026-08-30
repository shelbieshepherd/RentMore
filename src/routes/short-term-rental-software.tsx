import { createFileRoute } from "@tanstack/react-router";
import { PublicShell, useSeo, CtaButton, BRAND, seoHead } from "~/lib/public-page";

export const Route = createFileRoute("/short-term-rental-software")({
  head: () =>
    seoHead(
      "Short-Term Rental Software for Property Managers | RentMore",
      "A practical guide to short-term rental software for property managers: what to compare, which features actually save time, and how to evaluate tools before you sign up.",
      "/short-term-rental-software",
    ),
  component: ShortTermArticle,
});

function ShortTermArticle() {
  useSeo(
    "Short-Term Rental Software for Property Managers | RentMore",
    "A practical guide to short-term rental software for property managers: what to compare, which features actually save time, and how to evaluate tools before you sign up."
  );

  return (
    <PublicShell>
      <article className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-sm font-medium uppercase tracking-wide mb-4" style={{ color: BRAND }}>Guide</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight mb-6">
          Short-Term Rental Software for Property Managers: What Actually Saves You Time
        </h1>
        <p className="text-gray-600 text-lg leading-relaxed mb-8">
          Property managers hear about "short-term rental software" constantly, but most of what's marketed
          is aimed at individual hosts with one or two listings. If you manage five, ten, or twenty
          short-term properties on behalf of owners, your needs are different — and the tool you pick needs
          to hold up under that volume.
        </p>

        <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-12">The work that repeats every week</h2>
        <p className="text-gray-600 leading-relaxed mb-4">
          Before comparing feature matrices, map your week. Every property manager running short-term
          rentals does the same recurring work: collect payments, confirm arrivals and departures, respond
          to maintenance, and report to owners. The software that saves the most time is the one that makes
          those four loops tight.
        </p>
        <ul className="space-y-3 text-sm text-gray-600 mb-4">
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span><strong>Payments with real tracking.</strong> Deposits and balances by card or ACH, with statuses that flip to overdue automatically — so you never wonder who hasn't paid.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span><strong>Guest activity runs.</strong> A report showing who checks in and out over the next 7, 30, or 90 days, with the property and expected revenue on each row.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span><strong>Maintenance that isn't lost in texts.</strong> Requests with priority, status, and an assignee — logged in the system, not buried in your inbox.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span><strong>Owner statements that make sense.</strong> Gross bookings minus fees, per owner and per property, with the payout method (ACH or check) recorded.</span>
          </li>
        </ul>

        <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-12">The trap: five tools for five jobs</h2>
        <p className="text-gray-600 leading-relaxed mb-4">
          A common failure mode is software sprawl — a booking calendar in one tool, payments in the bank,
          maintenance in a group chat, owner reports in a spreadsheet you rebuild every month. Each tool is
          fine on its own; together they cost you the reconciliation work at the end of every month. A
          unified platform — where the booking, the payment, the guest record, and the owner statement are
          the same record — removes that entire class of work.
        </p>
        <p className="text-gray-600 leading-relaxed mb-4">
          That's the philosophy behind RentMore: one platform where short-term reservations and long-term
          leases live together. If you also manage annual rentals, see our guide to{" "}
          <a href="/property-management-software" className="underline" style={{ color: BRAND }}>property management software for short-term and long-term rentals</a>{" "}
          for how mixed portfolios work.
        </p>

        <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-12">Questions to ask any vendor</h2>
        <p className="text-gray-600 leading-relaxed mb-4">A few questions that separate substance from marketing:</p>
        <ul className="space-y-3 text-sm text-gray-600 mb-4">
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span><strong>Who is the merchant of record?</strong> If the platform holds your funds, you're dependent on their payout schedule. RentMore processes through your own Stripe account, so you're never waiting on us to release your money.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span><strong>How are OTA connections delivered?</strong> Direct platform partnerships are granted selectively; ask whether the vendor's channel integrations are their own or resold. RentMore builds its OTA architecture in-house.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span><strong>What does the reports tab actually produce?</strong> You want exportable guest activity, financial summaries, and tax reports — not vanity dashboards.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span><strong>Can you try it on your own portfolio?</strong> Any tool worth switching to should let you load your real properties and see whether the daily work gets faster.</span>
          </li>
        </ul>

        <h2 className="text-2xl font-bold text-gray-900 mb-4 mt-12">An honest note on maturity</h2>
        <p className="text-gray-600 leading-relaxed mb-4">
          RentMore is an early-stage product built by a working property manager. That means fewer bells and
          whistles than the enterprise suites — and a team that is actively using the problems you bring us.
          If you'd rather evaluate against a checklist, our guide to{" "}
          <a href="/vacation-rental-management-software" className="underline" style={{ color: BRAND }}>vacation rental management software</a>{" "}
          covers the full feature set to compare.
        </p>

        <div className="bg-gray-50 rounded-xl p-8 border border-gray-100 mt-12 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-3">Try RentMore on your own properties</h2>
          <p className="text-sm text-gray-600 mb-6 max-w-xl mx-auto">
            Pick a plan that fits your portfolio, load your properties, run a guest activity report, and see
            the owner statement math for yourself.
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
            Want the full picture first? <a href="/pitch" className="underline" style={{ color: BRAND }}>Read the product overview</a>.
          </p>
        </div>
      </article>
    </PublicShell>
  );
}
