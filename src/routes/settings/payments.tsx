import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardLayout } from "~/lib/layout";
import { useAuth } from "~/lib/auth";

export const Route = createFileRoute("/settings/payments")({ component: SettingsPaymentsPage });

const br = "#0f3c52";

interface ConnectStatus {
  accountId: string | null;
  onboardingComplete: boolean;
  isDemo: boolean;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function SettingsPaymentsPage() {
  const { user } = useAuth();
  const companyId = user?.companyId;
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Load Connect status; handle the ?onboarded=1 return from Stripe-hosted onboarding.
  // NOTE: Chunk D wires the authoritative `account.updated` webhook; for now the
  // completion flag is set via server fn on return so the flow works end-to-end
  // in test mode without webhooks.
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setLoadingStatus(true);
    (async () => {
      try {
        const { fetchConnectStatus, setConnectOnboardingComplete } = await import("~/lib/db-queries");
        let st = await fetchConnectStatus({ data: { companyId } });
        if (cancelled) return;
        if (st.accountId && !st.onboardingComplete && new URLSearchParams(location.search).has("onboarded")) {
          await setConnectOnboardingComplete({ data: { companyId } });
          st = { ...st, onboardingComplete: true };
          if (!cancelled) setNotice("Onboarding complete — your account is ready to accept online payments.");
        }
        if (!cancelled) setStatus(st);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Could not load payment settings.");
      } finally {
        if (!cancelled) setLoadingStatus(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const startOrResumeOnboarding = async () => {
    if (!companyId || busy) return;
    setBusy(true);
    setError("");
    try {
      const { createConnectAccount, getOnboardingLink } = await import("~/lib/db-queries");
      let url: string | null = null;
      if (!status?.accountId) {
        const created = await createConnectAccount({ data: { companyId } });
        setStatus((s) => (s ? { ...s, accountId: created.accountId } : s));
        url = created.onboardingUrl;
      } else {
        const link = await getOnboardingLink({ data: { accountId: status.accountId } });
        url = link.url;
      }
      if (url) {
        window.open(url, "_blank", "noopener");
        setNotice("Stripe's onboarding opened in a new tab. Finish it there, then come back here.");
      }
    } catch (e: any) {
      setError(e?.message || "Could not start Stripe onboarding.");
    }
    setBusy(false);
  };

  return (
    <DashboardLayout currentPath="/settings/payments">
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payment Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Connect your Stripe account to collect rent and booking payments online.
          </p>
        </div>

        {!companyId ? (
          <div className="stat-card p-8 text-center">
            <div className="text-4xl mb-3">🔒</div>
            <p className="text-sm text-gray-600">Log in to manage online payment settings.</p>
          </div>
        ) : loadingStatus && !status ? (
          <div className="stat-card p-8 text-center text-sm text-gray-500">Loading payment settings…</div>
        ) : status?.isDemo ? (
          <div className="stat-card p-8">
            <div className="flex items-start gap-3">
              <span className="text-3xl">🧪</span>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Demo mode</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Online payments are simulated in the demo account — no Stripe connection is needed.
                  Real companies connect their own Stripe account to collect payments.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Onboarding status */}
            <div className="stat-card p-8">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3">
                  <span className="text-3xl">
                    {status?.onboardingComplete ? "✅" : status?.accountId ? "✏️" : "💳"}
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {status?.onboardingComplete
                        ? "Online payments enabled"
                        : status?.accountId
                          ? "Finish your Stripe onboarding"
                          : "Enable online payments"}
                    </h2>
                    <p className="mt-1 text-sm text-gray-600 max-w-md">
                      {status?.onboardingComplete
                        ? "You can collect rent and booking payments online. Transactions are processed by your own Stripe account — RentMore never holds customer funds."
                        : status?.accountId
                          ? "Your Stripe account was created. Complete the hosted onboarding to start accepting payments."
                          : "Connect your own Stripe account (free, Stripe-hosted). You stay the merchant of record — RentMore only adds its platform fee."}
                    </p>
                    {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
                    {notice && <p className="mt-2 text-sm text-green-700">{notice}</p>}
                  </div>
                </div>
                <button
                  onClick={startOrResumeOnboarding}
                  disabled={busy}
                  className="btn-primary gap-2"
                  style={{ backgroundColor: br }}
                >
                  {busy ? "Opening…" : status?.onboardingComplete ? "Manage on Stripe" : status?.accountId ? "Resume onboarding" : "Start onboarding"}
                </button>
              </div>
            </div>

            {/* Fee summary */}
            <div className="stat-card p-8">
              <h3 className="text-base font-semibold text-gray-900 mb-4">RentMore platform fees</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-gray-100 p-4">
                  <p className="text-sm text-gray-500">Credit card</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">2.9% + $0.30</p>
                  <p className="text-xs text-gray-400 mt-1">per transaction</p>
                </div>
                <div className="rounded-xl border border-gray-100 p-4">
                  <p className="text-sm text-gray-500">ACH bank transfer</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">1% + $0.25</p>
                  <p className="text-xs text-gray-400 mt-1">per transaction</p>
                </div>
              </div>
              <p className="mt-4 text-xs text-gray-400">
                Stripe's own processing fees are deducted from your account's balance; the platform fee
                above is RentMore's. You can disable online payments anytime.
              </p>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
