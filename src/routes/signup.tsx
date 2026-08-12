import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "~/lib/auth";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const { register, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    navigate({ to: "/" });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const result = await register(name, email, password);
    setLoading(false);

    if (result.success) {
      if (result.needsVerification) {
        // Store email + company so verify-pending can resend / nudge onboarding
        if (typeof document !== "undefined") {
          document.cookie = `rentvue_signup_email=${encodeURIComponent(email)}; path=/; max-age=86400`;
          if (result.companyId) {
            document.cookie = `rentvue_signup_company=${result.companyId}; path=/; max-age=86400`;
          }
        }
        navigate({ to: "/verify-pending" });
      } else {
        navigate({ to: "/" });
      }
    } else {
      setError(result.error || "Registration failed");
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🏘️</div>
          <h1 className="text-2xl font-bold" style={{ color: "#0f3c52" }}>RentMore</h1>
          <p className="text-sm text-gray-500 mt-1">Create your account</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Sign Up</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company / Your Name</label>
              <input
                className="input-field"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Eastman Premier Rentals"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                className="input-field"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                className="input-field"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input
                className="input-field"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                required
              />
            </div>

            {error && (
              <div className={`text-sm px-4 py-2.5 rounded-lg ${error.includes("Database") ? "bg-blue-50 text-blue-600" : "bg-red-50 text-red-600"}`}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5"
              style={loading ? { opacity: 0.7 } : {}}
            >
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100 text-center">
            <p className="text-sm text-gray-500">
              Already have an account?{" "}
              <a href="/login" className="font-medium" style={{ color: "#0f3c52" }}>
                Sign in
              </a>
            </p>
          </div>
        </div>

        <p className="text-center mt-6">
          <a href="/" className="text-sm text-gray-400 hover:text-gray-600">
            ← Back to dashboard
          </a>
        </p>
      </div>
    </div>
  );
}
