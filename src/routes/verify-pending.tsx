import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/verify-pending")({
  component: VerifyPendingPage,
});

function VerifyPendingPage() {
  const navigate = useNavigate();
  const [resending, setResending] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  // Post-signup nudge: if the just-registered company has no Stripe Connect
  // account yet, suggest setting up online payments (real companies only).
  const [connectInfo, setConnectInfo] = useState<{ hasAccount: boolean; isDemo: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const companyId = typeof document !== "undefined" ? getCookie("rentvue_signup_company") : null;
    if (!companyId) return;
    (async () => {
      try {
        const { fetchConnectStatus } = await import("~/lib/db-queries");
        const st = await fetchConnectStatus({ data: { companyId } });
        if (!cancelled) setConnectInfo({ hasAccount: !!st.accountId, isDemo: st.isDemo });
      } catch {
        // Non-fatal — the nudge simply won't show.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleResend() {
    setResending(true);
    // Get email from cookie if available, or prompt
    const stored = typeof document !== "undefined" ? getCookie("rentvue_signup_email") : null;
    const email = stored || (typeof window !== "undefined" ? prompt("Enter the email address you signed up with:") : null);
    if (!email) {
      setResending(false);
      return;
    }
    try {
      const { regenerateVerifyToken, queueVerificationEmail } = await import("~/lib/db-queries");
      const result = await regenerateVerifyToken({ data: { email } });
      if (result.success && result.token) {
        await queueVerificationEmail({ data: { email, token: result.token } });
        setResendDone(true);
      } else {
        alert(result.error || "Could not resend verification email.");
      }
    } catch {
      alert("Could not resend verification email. Please try again later.");
    }
    setResending(false);
  }

  function handleLogout() {
    // Clear session cookie
    if (typeof document !== "undefined") {
      document.cookie = "rentvue_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
      document.cookie = "rentvue_signup_email=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
      document.cookie = "rentvue_signup_company=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    }
    navigate({ to: "/login" });
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50 px-4">
      <div className="w-full max-w-md text-center">
        <div className="text-4xl mb-2">📧</div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: "#0f3c52" }}>Check Your Inbox</h1>
        <p className="text-sm text-gray-500 mb-6">We sent a verification email to your address.</p>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="text-5xl mb-4">✉️</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Verify your email</h2>
          <p className="text-sm text-gray-500 mb-6">
            Click the link in the email we sent to verify your account.
            If you don't see it, check your spam folder.
          </p>

          {resendDone ? (
            <p className="text-sm text-green-600 mb-4">Verification email resent — check your inbox.</p>
          ) : (
            <button
              onClick={handleResend}
              disabled={resending}
              className="text-sm font-medium mb-4"
              style={{ color: "#0f3c52" }}
            >
              {resending ? "Sending..." : "Resend verification email"}
            </button>
          )}

          <div className="mt-6 pt-6 border-t border-gray-100">
            <button
              onClick={handleLogout}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              ← Back to login
            </button>
          </div>
        </div>

        {connectInfo && !connectInfo.isDemo && !connectInfo.hasAccount && (
          <div className="mt-4 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-left">
            <div className="flex items-start gap-3">
              <span className="text-2xl">💳</span>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Get ready to collect payments</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Once you've verified your email, connect your own Stripe account to start collecting
                  rent and booking payments online (guests pay a 3.5% card convenience fee; ACH is free for guests — you keep it all; RentMore takes no transaction fee).
                </p>
                <button
                  onClick={() => navigate({ to: "/settings/payments" })}
                  className="mt-4 btn-primary w-full"
                  style={{ backgroundColor: "#0f3c52" }}
                >
                  Set up online payments
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}
