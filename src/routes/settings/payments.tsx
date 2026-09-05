import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardLayout } from "~/lib/layout";
import { OnboardingWizard } from "~/lib/onboarding-wizard";
import { useAuth } from "~/lib/auth";

export const Route = createFileRoute("/settings/payments")({ component: SettingsPaymentsPage });

const br = "#0f3c52";

interface ConnectStatus {
  accountId: string | null;
  onboardingComplete: boolean;
  isDemo: boolean;
  chargesEnabled?: boolean;
  cardPaymentsActive?: boolean;
  cardPaymentsCapability?: string | null;
  requirements?: {
    currentlyDue: string[];
    eventuallyDue: string[];
    pastDue: string[];
    disabledReason: string | null;
  } | null;
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
          const res = await setConnectOnboardingComplete({ data: { companyId } });
          if (res.success) {
            st = { ...st, onboardingComplete: true };
            if (!cancelled) setNotice("Onboarding complete — your account is ready to accept online payments.");
          } else {
            // Server verifies against Stripe and only flips the flag when the
            // account can actually charge; surface a clear explainer otherwise.
            if (!cancelled) setNotice("Your Stripe onboarding returned, but your account isn't verified as charge-enabled yet. We'll confirm as soon as it is — this can take a few minutes.");
          }
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
                <p className="mt-2 text-xs text-gray-500">
                  To try <span className="font-medium">real</span> card-saving in the demo, connect a
                  real Stripe account below — you'll finish Express onboarding with Stripe, and the
                  demo account will then collect real payments and save real cards end-to-end.
                </p>
                {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
                {notice && <p className="mt-2 text-sm text-green-700">{notice}</p>}
              </div>
            </div>
            <button
              onClick={startOrResumeOnboarding}
              disabled={busy}
              className="btn-primary gap-2 mt-4"
              style={{ backgroundColor: br }}
            >
              {busy ? "Opening…" : "Connect a real Stripe account"}
            </button>
          </div>
        ) : (
          <>
            {status?.onboardingComplete ? (
              <div className="stat-card p-8">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">✅</span>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Online payments enabled</h2>
                      <p className="mt-1 text-sm text-gray-600 max-w-md">
                        You can collect rent and booking payments online. Transactions are processed by your own Stripe account — RentMore never holds customer funds.
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
                    {busy ? "Opening…" : "Manage on Stripe"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {notice && <p className="text-sm text-green-700">{notice}</p>}
                {status?.requirements && !status.onboardingComplete && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <p className="font-semibold">{status.chargesEnabled ? "Card payments are not active yet" : "Your Stripe account is not charge-enabled yet"}</p>
                    <p className="mt-1 text-amber-800">
                      Stripe reports the following still-needed requirements before online payments go live —
                      finish these from your Stripe account (or via “Resume onboarding”):
                    </p>
                    <ul className="mt-2 list-disc pl-5 space-y-1">
                      {(status.requirements.currentlyDue?.length ? status.requirements.currentlyDue : status.requirements.eventuallyDue).map((req) => (
                        <li key={req}>{req}</li>
                      ))}
                      {status.requirements.disabledReason ? (
                        <li className="font-medium">Disabled reason: {status.requirements.disabledReason}</li>
                      ) : null}
                    </ul>
                    <p className="mt-2 text-xs text-amber-700">
                      Stripe status: charges {status.chargesEnabled ? "enabled" : "not enabled"} · card capability{" "}
                      {status.cardPaymentsActive ? "active" : `not active (${status.cardPaymentsCapability || "unknown"})`}.
                    </p>
                    <p className="mt-2 text-xs text-amber-700">
                      If the list above is empty, Stripe is still reviewing your account — it becomes
                      charge-enabled automatically once review finishes (no action needed from you).
                    </p>
                  </div>
                )}
                <OnboardingWizard
                  companyId={companyId}
                  accountId={status?.accountId ?? null}
                  onAccountCreated={(id) => setStatus((s) => (s ? { ...s, accountId: id } : s))}
                  accentColor={br}
                />
              </>
            )}
            {/* Fee summary */}
            <div className="stat-card p-8">
              <h3 className="text-base font-semibold text-gray-900 mb-4">How fees work — guests pay, you keep it all</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-gray-100 p-4">
                  <p className="text-sm text-gray-500">Credit card</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">3.5%</p>
                  <p className="text-xs text-gray-400 mt-1">convenience fee, guest pays</p>
                </div>
                <div className="rounded-xl border border-gray-100 p-4">
                  <p className="text-sm text-gray-500">ACH bank transfer</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">$0.00</p>
                  <p className="text-xs text-gray-400 mt-1">convenience fee, guest pays</p>
                </div>
              </div>
              <p className="mt-4 text-xs text-gray-400">
                Payments are processed through your own Stripe account — you stay the merchant of record and
                receive 100% of every booking. Guests pay a 3.5% card convenience fee; ACH is free for guests (you absorb Stripe's ACH cost) —
                after Stripe's processing cost, it all goes to you. RentMore takes no transaction fee.
                Chargebacks, refunds, and disputes
                are resolved against your Stripe account's balance — RentMore is never the merchant of record and
                never holds customer funds. You can disable online payments anytime.
              </p>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
