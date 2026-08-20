import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/pitch")({
  component: PitchPage,
});

function PitchPage() {
  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* ── Nav ── */}
      <nav className="border-b border-gray-100 bg-white/95 sticky top-0 z-50 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 no-underline">
            <span className="text-xl font-bold tracking-tight" style={{ color: "#0f3c52" }}>RentMore</span>
          </a>
          <div className="flex items-center gap-4">
            <a href="/login" className="text-sm text-gray-600 hover:text-gray-900">Log in</a>
            <a
              href="/signup"
              className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-colors"
              style={{ backgroundColor: "#0f3c52" }}
            >
              Get started
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <p className="text-sm font-medium uppercase tracking-wide mb-4" style={{ color: "#0f3c52" }}>For Property Managers</p>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight mb-6">
          One platform for{" "}
          <span style={{ color: "#0f3c52" }}>short-term</span>
          {" "}and{" "}
          <span style={{ color: "#0f3c52" }}>long-term</span>
          {" "}rentals
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-10">
          Online payments, tenant &amp; guest management, maintenance, lease &amp; reservation tracking, owner payouts, and compliance reporting — all in one place. Stop juggling separate tools for vacation rentals and annual leases.
        </p>
        <div className="flex items-center justify-center gap-4">
          <a
            href="/signup"
            className="px-8 py-3.5 rounded-lg text-base font-semibold text-white hover:opacity-90 transition-colors shadow-lg"
            style={{ backgroundColor: "#0f3c52" }}
          >
            Get started
          </a>
          <a
            href="#pricing"
            className="px-8 py-3.5 rounded-lg text-base font-medium text-gray-700 border border-gray-200 hover:border-gray-300 transition-colors"
          >
            See pricing
          </a>
        </div>
      </section>

      {/* ── The Reporting Wedge ── */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-sm font-medium uppercase tracking-wide mb-2" style={{ color: "#0f3c52" }}>The reporting wedge</p>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Compliance reports that pay for themselves</h2>
            <p className="text-gray-600 max-w-xl mx-auto">
              These are the reports property managers dread — and the ones that win the conversation with owners.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: "🧾",
                title: "Monthly Rooms &amp; Meals Tax",
                desc: "NH 8.5% tax report, ready every month. Editable rate for any state. Room revenue, tax collected, totals — export to CSV or print for your accountant.",
              },
              {
                icon: "🏦",
                title: "Owner Payout Statements",
                desc: "Room rate minus commission, with ACH or check method per payout run. Clear breakdown owners understand — built for multiple payouts per month.",
              },
              {
                icon: "💳",
                title: "Guest-Paid Convenience Fees",
                desc: "Guests pay a 3.5% card convenience fee — ACH is free (you absorb the small Stripe cost). You keep 100% of every booking plus the leftover after Stripe's cost. Fee breakdowns per transaction.",
              },
            ].map((item) => (
              <div key={item.title} className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
                <div className="text-3xl mb-3">{item.icon}</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Everything in one place</h2>
            <p className="text-gray-600 max-w-xl mx-auto">
              Built for property managers running 5&ndash;50 units across short-term and long-term rentals.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: "💰", title: "Online Payments", desc: "Card + ACH. Record rent and booking payments. Automatic status tracking: paid, pending, overdue." },
              { icon: "👥", title: "Tenants & Guests", desc: "Manage long-term tenants and short-term guests side by side. Check-in/check-out tracking." },
              { icon: "🔧", title: "Maintenance", desc: "Request tracking with priority, status, and assignee. Resolve issues without leaving the platform." },
              { icon: "📅", title: "Leases & Reservations", desc: "Track lease dates and reservation blocks. Calendar view across your whole portfolio." },
              { icon: "🏠", title: "Properties", desc: "Full property profiles: type, rates, beds, amenities, house rules. Ready for OTA listings." },
              { icon: "🏦", title: "Owner Payouts", desc: "Calculate what's owed per owner, per property, per period. Mark paid with ACH or check method." },
              { icon: "📈", title: "Reports", desc: "Financial summaries, check-in/check-out runs, tax reports, guest-paid convenience fees — exportable and printable." },
              { icon: "🔌", title: "OTA Ready", desc: "Integrations tab with Airbnb & VRBO architecture built. Direct connectivity on the roadmap." },
            ].map((f) => (
              <div key={f.title} className="bg-white rounded-xl p-5 border border-gray-100 hover:shadow-md transition-shadow">
                <div className="text-2xl mb-3">{f.icon}</div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">{f.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="bg-gray-50 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Simple, transparent pricing</h2>
            <p className="text-gray-600 max-w-xl mx-auto">
              No hidden fees. No long-term contracts. Cancel anytime.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { name: "Starter", price: "$49", units: "Up to 10 units", highlight: false },
              { name: "Growth", price: "$149", units: "Up to 30 units", highlight: true },
              { name: "Pro", price: "$349", units: "Up to 75 units", highlight: false },
              { name: "Enterprise", price: "From $499", units: "75+ units", highlight: false },
            ].map((tier) => (
              <div
                key={tier.name}
                className={`rounded-xl p-6 border shadow-sm ${
                  tier.highlight
                    ? "border-2 bg-white relative"
                    : "border-gray-100 bg-white"
                }`}
                style={tier.highlight ? { borderColor: "#0f3c52" } : {}}
              >
                {tier.highlight && (
                  <span
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: "#0f3c52" }}
                  >
                    Most popular
                  </span>
                )}
                <h3 className="text-lg font-semibold text-gray-900 mb-1">{tier.name}</h3>
                <p className="text-3xl font-bold text-gray-900 mb-1">{tier.price}<span className="text-lg font-normal text-gray-400">/mo</span></p>
                <p className="text-sm text-gray-500 mb-6">{tier.units}</p>
                <a
                  href="/signup"
                  className={`block text-center py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    tier.highlight
                      ? "text-white hover:opacity-90"
                      : "border border-gray-200 text-gray-700 hover:border-gray-300"
                  }`}
                  style={tier.highlight ? { backgroundColor: "#0f3c52" } : {}}
                >
                  Get started
                </a>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-400 mt-8">
            Guests pay a 3.5% card convenience fee &nbsp;|&nbsp; ACH is free for guests — you keep it all (RentMore takes zero transaction fees)
          </p>
        </div>
      </section>

      {/* ── Check-in / Check-out runs ── */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Know who's coming and going</h2>
              <p className="text-gray-600 mb-6 leading-relaxed">
                The Guest Activity tab in Reports shows check-in and check-out runs for any date range. Filter by today, 7 days, 30 days, or 90 days. Each row shows guest name, property, dates, source, and expected revenue — exportable as CSV.
              </p>
              <ul className="space-y-3 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  Check-in runs: see who arrives today, this week, or this month
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  Check-out runs: plan turnovers and cleaning schedules
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  Export to CSV for your cleaning crew or front desk
                </li>
              </ul>
            </div>
            <div className="bg-gray-50 rounded-xl p-8 border border-gray-100">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-3">Guest Activity Report</p>
              <div className="space-y-3">
                {[
                  { guest: "Lisa Thompson", prop: "Sunset Villa", dates: "Jul 10 – Jul 17", source: "Direct", revenue: "$3,150" },
                  { guest: "Alex Garcia", prop: "Mountain Lodge", dates: "Jul 5 – Jul 12", source: "VRBO", revenue: "$4,060" },
                  { guest: "Jennifer Park", prop: "Mountain Lodge", dates: "Jul 20 – Jul 27", source: "Airbnb", revenue: "$4,200" },
                ].map((r, i) => (
                  <div key={i} className="flex items-center justify-between bg-white rounded-lg p-3 text-sm border border-gray-100">
                    <div>
                      <span className="font-medium text-gray-900">{r.guest}</span>
                      <span className="text-gray-400 mx-2">·</span>
                      <span className="text-gray-500">{r.prop}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-gray-400">{r.dates}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500">{r.source}</span>
                      <span className="font-medium text-gray-900">{r.revenue}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Early stage honesty ── */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Early stage, deeply focused</h2>
          <p className="text-gray-600 leading-relaxed">
            RentMore is a young product built by a working property manager who lives the same problems you do. We're focused on doing a few things well — mixed-portfolio management, owner payouts, and compliance reporting — rather than building everything for everyone. If that sounds like what you need, we'd love to show you around.
          </p>
          <a
            href="/signup"
            className="inline-block mt-8 px-8 py-3.5 rounded-lg text-base font-semibold text-white hover:opacity-90 transition-colors"
            style={{ backgroundColor: "#0f3c52" }}
          >
            Try RentMore free
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-sm text-gray-400">© {new Date().getFullYear()} RentMore. Property management software for short-term and long-term rentals.</span>
          <div className="flex items-center gap-6">
            <a href="/login" className="text-sm text-gray-400 hover:text-gray-600">Log in</a>
            <a href="/signup" className="text-sm text-gray-400 hover:text-gray-600">Sign up</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
