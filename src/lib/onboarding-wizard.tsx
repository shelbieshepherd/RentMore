// Shared Stripe Connect onboarding wizard — rendered on BOTH the Payments tab
// and Settings → Payment Settings so every entry point shows the same 3-step
// walkthrough (What this is / How it works / Launch → Stripe).
//
// Fee model (owner Aug 13, FINAL): guests pay a 3.5% card convenience fee
// (1% + $0.25 ACH); you receive 100% of the booking plus the leftover after
// Stripe's processing cost. RentMore takes no transaction fee.
//
// Real companies only — callers render this when the company is NOT demo and
// onboarding is NOT complete. The demo company stays on the mock path.
import { useState } from "react";

export function OnboardingWizard({
  companyId,
  accountId,
  onAccountCreated,
  accentColor = "#0f3c52",
}: {
  companyId: string;
  /** Existing connected account id (null → create one on launch). */
  accountId: string | null;
  /** Called with the created account id so the parent can keep state in sync. */
  onAccountCreated: (accountId: string) => void;
  accentColor?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stripeUrl, setStripeUrl] = useState<string | null>(null);

  const launch = async () => {
    if (!companyId || busy) return;
    setBusy(true);
    setError("");
    setStripeUrl(null);
    try {
      const { createConnectAccount, getOnboardingLink } = await import("~/lib/db-queries");
      let url: string | null = null;
      if (!accountId) {
        const created = await createConnectAccount({ data: { companyId } });
        onAccountCreated(created.accountId);
        url = created.onboardingUrl ?? null;
      } else {
        const link = await getOnboardingLink({ data: { accountId } });
        url = link.url ?? null;
      }
      if (url) {
        // Always surface the returned Stripe URL so the user can click through
        // even if the popup is blocked or Stripe redirects elsewhere.
        setStripeUrl(url);
        window.open(url, "_blank", "noopener");
      } else {
        setError("Stripe returned no onboarding link — please try again.");
      }
    } catch (e: any) {
      setError(e?.message || "Could not start Stripe onboarding.");
    }
    setBusy(false);
  };

  return (
    <div className="card p-6" style={{ borderLeft: `4px solid ${accentColor}` }}>
      <h2 className="text-lg font-semibold text-gray-900">
        {accountId ? "Finish enabling online payments" : "Enable online payments"}
      </h2>
      <p className="text-sm text-gray-500 mt-1">
        Collect rent and booking payments online — guests pay through{" "}
        <strong>your own Stripe account</strong>, and you keep{" "}
        <strong>100% of every payment</strong>.
      </p>
      {/* Step 1 — what this is */}
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">1 · What this is</p>
          <p className="mt-2 text-sm text-gray-600 leading-relaxed">
            Guests and tenants pay rent and booking fees with credit card or ACH. You stay the{" "}
            <strong>merchant of record</strong> — RentMore never holds your funds.
          </p>
          <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
            <div className="flex justify-between"><span>Card</span><span className="font-semibold">3.5% convenience fee (guest pays)</span></div>
            <div className="flex justify-between mt-1"><span>ACH</span><span className="font-semibold">1% + $0.25 (guest pays)</span></div>
            <div className="flex justify-between mt-1 border-t border-gray-200 pt-1"><span>You keep</span><span className="font-semibold text-emerald-600">100% of every payment — the guest-paid fee covers Stripe's cost, the rest is yours</span></div>
          </div>
        </div>
        {/* Step 2 — how it works */}
        <div className="rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">2 · How it works</p>
          <p className="mt-2 text-sm text-gray-600 leading-relaxed">
            Takes a few minutes. Stripe hosts the whole onboarding — you'll need your{" "}
            <strong>business details and a bank account</strong>. When you finish, you'll land
            back here and online payments are live.
          </p>
          <ul className="mt-3 space-y-1.5 text-xs text-gray-500">
            <li>✅ Create your free Stripe account</li>
            <li>✅ Enter business details + bank account</li>
            <li>✅ Verify identity (Stripe-hosted, secure)</li>
            <li>✅ Done — payments are enabled</li>
          </ul>
        </div>
        {/* Step 3 — launch */}
        <div className="rounded-xl border border-gray-100 p-4 flex flex-col">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">3 · Launch</p>
          <p className="mt-2 text-sm text-gray-600 leading-relaxed flex-1">
            {accountId
              ? "Your Stripe account is already created — continue where you left off."
              : "Ready? Open Stripe-hosted onboarding in a new tab."}
          </p>
          <button
            onClick={launch}
            disabled={busy}
            className="btn-primary gap-2 w-full mt-4"
            style={{ backgroundColor: accentColor }}
          >
            {busy ? "Opening…" : accountId ? "Resume onboarding" : "Start Stripe onboarding"}
          </button>
          {stripeUrl && !busy && (
            <a
              href={stripeUrl}
              target="_blank"
              rel="noopener"
              className="mt-2 text-xs text-blue-600 underline break-all"
            >
              If the tab didn't open, click here to continue in Stripe.
            </a>
          )}
          <p className="text-xs text-gray-400 mt-2">
            A new tab opens — come back here when you're done.
          </p>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <p className="mt-4 text-xs text-gray-400 border-t border-gray-100 pt-3">
        Payments are processed by your own Stripe account — RentMore is never the merchant of
        record and never holds customer funds. Chargebacks, refunds, and disputes are resolved
        against your Stripe account's balance (see Stripe's connected account agreement for
        details); RentMore is not liable for losses on your account.
      </p>
    </div>
  );
}
