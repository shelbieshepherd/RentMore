import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { resetPassword } from "~/lib/db-queries";
export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});
function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const token = params?.get("token") || "";
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const result = await resetPassword({ data: { token, password } });
      if (result.success) {
        setDone(true);
      } else {
        setError(result.error || "Could not reset password.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  if (!token) {
    return (
      <Shell>
        <div className="text-center">
          <div className="text-4xl mb-3">🔗</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Invalid reset link</h2>
          <p className="text-sm text-gray-500 mb-6">
            This link is missing its token. Please request a new password reset.
          </p>
          <Link to="/forgot-password" className="btn-primary inline-block">Request a new link</Link>
        </div>
      </Shell>
    );
  }
  return (
    <Shell>
      {done ? (
        <div className="text-center">
          <div className="text-4xl mb-3">✅</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Password updated</h2>
          <p className="text-sm text-gray-500 mb-6">
            Your password has been changed. You can now sign in with your new password.
          </p>
          <Link to="/login" className="btn-primary inline-block">Sign In</Link>
        </div>
      ) : (
        <>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Set a new password</h2>
          <p className="text-sm text-gray-500 mb-6">Choose a new password for your account.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
              <input
                className="input-field"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
              <input
                className="input-field"
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Re-enter your new password"
                required
              />
            </div>
            {error && (
              <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-lg">
                {error}
              </div>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Saving…" : "Update Password"}
            </button>
          </form>
          <div className="mt-6 text-center text-sm">
            <Link to="/forgot-password" className="text-[#0f3c52] font-medium hover:underline">
              Request a new link
            </Link>
          </div>
        </>
      )}
    </Shell>
  );
}
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🏘️</div>
          <h1 className="text-2xl font-bold" style={{ color: "#0f3c52" }}>RentMore</h1>
          <p className="text-sm text-gray-500 mt-1">Property Management Dashboard</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
