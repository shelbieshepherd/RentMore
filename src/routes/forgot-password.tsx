import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { requestPasswordReset } from "~/lib/db-queries";
export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});
function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await requestPasswordReset({ data: { email } });
      // Always show success — no account enumeration.
      setSent(true);
    } catch {
      setError("Something went wrong sending the reset email. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🏘️</div>
          <h1 className="text-2xl font-bold" style={{ color: "#0f3c52" }}>RentMore</h1>
          <p className="text-sm text-gray-500 mt-1">Property Management Dashboard</p>
        </div>
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {sent ? (
            <div className="text-center">
              <div className="text-4xl mb-3">📬</div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Check your inbox</h2>
              <p className="text-sm text-gray-500 mb-6">
                If that email exists, a password reset link is on its way. It expires in 1 hour.
              </p>
              <Link to="/login" className="btn-primary inline-block">Back to Sign In</Link>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Forgot your password?</h2>
              <p className="text-sm text-gray-500 mb-6">
                Enter your account email and we'll send you a link to reset your password.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    className="input-field"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    autoFocus
                  />
                </div>
                {error && (
                  <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-lg">
                    {error}
                  </div>
                )}
                <button type="submit" disabled={loading} className="btn-primary w-full">
                  {loading ? "Sending…" : "Send Reset Link"}
                </button>
              </form>
              <div className="mt-6 text-center text-sm">
                <Link to="/login" className="text-[#0f3c52] font-medium hover:underline">
                  Back to Sign In
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
