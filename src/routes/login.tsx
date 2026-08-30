import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "~/lib/auth";
import appCss from "~/styles/app.css?url";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // If already authenticated, redirect based on role
  if (isAuthenticated && user) {
    navigate({ to: user.role === "owner" ? "/owner" : "/" });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await login(email, password);
    setLoading(false);

    if (result.success) {
      navigate({ to: user?.role === "owner" ? "/owner" : "/" });
    } else {
      setError(result.error || "Login failed");
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/favicon.svg" alt="RentMore" className="w-14 h-14 mx-auto mb-2" />
          <h1 className="text-2xl font-bold" style={{ color: "#0f3c52" }}>RentMore</h1>
          <p className="text-sm text-gray-500 mt-1">Property Management Dashboard</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Sign In</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                className="input-field"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="demo@rentmore.com"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                className="input-field"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5"
              style={loading ? { opacity: 0.7 } : {}}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
            <div className="text-center">
              <a href="/forgot-password" className="text-sm font-medium hover:underline" style={{ color: "#0f3c52" }}>
                Forgot password?
              </a>
            </div>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-sm text-center mb-3">
              <span className="text-gray-500">New to RentMore? </span>
              <a href="/signup" className="font-medium" style={{ color: "#0f3c52" }}>
                Create an account
              </a>
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}