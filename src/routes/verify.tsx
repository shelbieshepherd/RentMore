import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/verify")({
  component: VerifyPage,
});

function VerifyPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) {
      setState("error");
      setMessage("Missing verification token. Please check your email link.");
      return;
    }
    verify(token);
  }, []);

  async function verify(token: string) {
    try {
      const { verifyEmail } = await import("~/lib/db-queries");
      const result = await verifyEmail({ data: { token } });
      if (result.valid) {
        setState("success");
        setMessage("Email verified! You can now log in.");
      } else {
        setState("error");
        setMessage(result.error || "Verification failed.");
        // Store the email for resend if available
        if ("email" in result && result.email) setResendEmail(result.email);
      }
    } catch {
      setState("error");
      setMessage("Unable to verify email right now. Please try again later.");
    }
  }

  async function handleResend() {
    if (!resendEmail) return;
    setResending(true);
    try {
      const { regenerateVerifyToken, queueVerificationEmail } = await import("~/lib/db-queries");
      const result = await regenerateVerifyToken({ data: { email: resendEmail } });
      if (result.success && result.token) {
        await queueVerificationEmail({ data: { email: resendEmail, token: result.token } });
        setResendDone(true);
        setMessage("A new verification email has been sent. Please check your inbox.");
      } else {
        setMessage(result.error || "Could not resend verification email.");
      }
    } catch {
      setMessage("Could not resend verification email. Please try again later.");
    }
    setResending(false);
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50 px-4">
      <div className="w-full max-w-md text-center">
        <div className="text-4xl mb-2">🏘️</div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: "#0f3c52" }}>RentMore</h1>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mt-6">
          {state === "loading" && (
            <>
              <div className="animate-pulse text-gray-400 mb-2 text-lg">Verifying your email...</div>
              <div className="w-8 h-8 border-2 border-gray-200 border-t-[#0f3c52] rounded-full animate-spin mx-auto" />
            </>
          )}

          {state === "success" && (
            <>
              <div className="text-4xl mb-3">✅</div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Email Verified</h2>
              <p className="text-sm text-gray-500 mb-6">{message}</p>
              <a
                href="/login"
                className="btn-primary inline-block w-full py-2.5 rounded-lg"
                style={{ backgroundColor: "#0f3c52", color: "white" }}
              >
                Sign In
              </a>
            </>
          )}

          {state === "error" && (
            <>
              <div className="text-4xl mb-3">⚠️</div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Verification Failed</h2>
              <p className="text-sm text-gray-500 mb-4">{message}</p>
              {resendDone ? (
                <p className="text-sm text-green-600 mb-4">{message}</p>
              ) : resendEmail ? (
                <button
                  onClick={handleResend}
                  disabled={resending}
                  className="text-sm font-medium mb-4"
                  style={{ color: "#0f3c52" }}
                >
                  {resending ? "Sending..." : "Resend verification email"}
                </button>
              ) : null}
              <p className="text-sm text-gray-400 mt-4">
                <a href="/login" className="underline">Go to login</a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
