import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "~/lib/auth";
import { DashboardLayout } from "~/lib/layout";

export const Route = createFileRoute("/plan")({
  component: PlanPage,
});

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 49,
    units: "Up to 10",
    link: "https://buy.stripe.com/bJe9ATaHrefL4dm9Tdgfu00",
    desc: "Online payments, tenant/guest management, maintenance requests, lease & reservation tracking.",
  },
  {
    id: "growth",
    name: "Growth",
    price: 149,
    units: "Up to 30",
    link: "https://buy.stripe.com/14A14neXHc7D8tC7L5gfu01",
    desc: "Everything in Starter plus owner payouts, financial reports, tax compliance.",
  },
  {
    id: "pro",
    name: "Pro",
    price: 349,
    units: "Up to 75",
    link: "https://buy.stripe.com/dRm3cv16RfjPfW40iDgfu02",
    desc: "Everything in Growth plus multi-user access, vendor management, document storage.",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 499,
    units: "75+ units",
    link: "https://buy.stripe.com/7sYbJ1aHrdbHbFOe9tgfu03",
    desc: "Everything in Pro plus dedicated support, custom onboarding, priority feature requests.",
  },
];

function PlanPage() {
  const { user } = useAuth();
  const [currentTier, setCurrentTier] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);

  // Fetch real tier from DB
  useEffect(() => {
    if (!user?.companyId) return;
    import("~/lib/db-queries").then(({ fetchCompanyPlan }) => {
      fetchCompanyPlan({ data: { companyId: user.companyId! } })
        .then(tier => setCurrentTier(typeof tier === "string" ? tier : null))
        .catch(() => {});
    });
  }, [user?.companyId]);

  async function handleSubscribe(planId: string, link: string) {
    if (!user?.companyId) return;
    const pendingTier = planId + "_pending";
    // Persist _pending tier BEFORE opening Stripe
    try {
      const { updateCompanySubscription } = await import("~/lib/db-queries");
      await updateCompanySubscription({ data: { companyId: user.companyId, subscriptionTier: pendingTier } });
    } catch { /* best-effort */ }
    setCurrentTier(pendingTier);
    setPendingPlan(planId);
    window.open(link, "_blank");
  }

  function tierDisplay(tier: string | null): string {
    if (!tier || tier === "free") return "Free";
    if (tier.endsWith("_pending")) return tier.replace("_pending", "").replace(/^./, c => c.toUpperCase()) + " (activation pending)";
    return tier.charAt(0).toUpperCase() + tier.slice(1);
  }

  return (
    <DashboardLayout currentPath="/plan">
      <div className="max-w-5xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Choose Your Plan</h1>
        <p className="text-sm text-gray-500 mb-8">
          Guests pay a 3.5% card convenience fee (1% + $0.25 on ACH) — you receive 100% of every payment. Billed monthly via Stripe checkout.
        </p>

        {pendingPlan && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <strong>⏳ Activation pending:</strong> You selected the{" "}
            <strong>{pendingPlan.charAt(0).toUpperCase() + pendingPlan.slice(1)}</strong> plan.
            Your payment is being processed by Stripe. We'll activate your plan once the payment is confirmed.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`bg-white rounded-2xl shadow-sm border p-6 flex flex-col ${
                plan.id === "pro" ? "border-[#0f3c52] ring-1 ring-[#0f3c52]" : "border-gray-100"
              }`}
            >
              {plan.id === "pro" && (
                <span className="text-xs font-medium text-white bg-[#0f3c52] px-2 py-0.5 rounded-full self-start mb-3">
                  Popular
                </span>
              )}
              <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
              <div className="mt-2 mb-1">
                <span className="text-3xl font-bold text-gray-900">${plan.price}</span>
                <span className="text-sm text-gray-400">/month</span>
              </div>
              <p className="text-xs text-gray-500 mb-4">{plan.units} units</p>
              <p className="text-sm text-gray-600 mb-6 flex-1">{plan.desc}</p>
              <button
                onClick={() => handleSubscribe(plan.id, plan.link)}
                className="btn-primary w-full py-2.5 rounded-lg text-sm font-medium"
                style={{ backgroundColor: "#0f3c52", color: "white" }}
              >
                Pay &amp; Activate
              </button>
              <p className="text-xs text-gray-400 mt-2 text-center">
                Opens Stripe checkout in a new tab
              </p>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400 mt-6 text-center">
          Current plan: <span className="font-medium">{tierDisplay(currentTier)}</span>.
          {currentTier && currentTier.endsWith("_pending") && " Plan changes are reflected after your payment is confirmed."}
        </p>

        <div className="mt-8 bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
          <strong>💡 Enterprise?</strong> For 75+ units, our Enterprise plan starts at $499/month.{" "}
          <a href="mailto:shelbie@sheprealty.com" className="underline">Contact us</a> for custom pricing and onboarding.
        </div>
      </div>
    </DashboardLayout>
  );
}
