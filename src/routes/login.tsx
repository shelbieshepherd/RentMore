import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth, seedUsers } from "~/lib/auth";
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
          <div className="text-4xl mb-2">🏘️</div>
          <h1 className="text-2xl font-bold" style={{ color: "#0f3c52" }}>RentVue</h1>
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
                placeholder="admin@rentvue.com"
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
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-sm text-center mb-3">
              <span className="text-gray-500">New to RentVue? </span>
              <a href="/signup" className="font-medium" style={{ color: "#0f3c52" }}>
                Create an account
              </a>
            </p>
            <p className="text-xs text-gray-400 text-center mb-3">Demo accounts (password: password123)</p>
            <div className="space-y-1.5">
              {seedUsers.map(u => (
                <button
                  key={u.id}
                  onClick={() => { setEmail(u.email); setPassword(u.password); }}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-gray-50 flex items-center justify-between group"
                >
                  <div>
                    <span className="font-medium text-gray-700">{u.name}</span>
                    <span className="text-gray-400 ml-2">{u.email}</span>
                  </div>
                  <span className={`badge text-[10px] ${u.role === "admin" ? "bg-purple-100 text-purple-800" : u.role === "owner" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>{u.role}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center mt-6">
          <a href="/book" className="text-sm text-gray-400 hover:text-gray-600">
            ← Browse properties to book
          </a>
        </p>
      </div>
    </div>
  );
}