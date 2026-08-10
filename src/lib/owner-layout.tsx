import { type ReactNode } from "react";
import { useAuth } from "~/lib/auth";
import { useNavigate } from "@tanstack/react-router";

const ownerNavItems = [
  { href: "/owner", label: "Dashboard", icon: "📊" },
  { href: "/owner/properties", label: "My Properties", icon: "🏠" },
  { href: "/owner/blocks", label: "Owner Blocks", icon: "📅" },
  { href: "/owner/payouts", label: "My Payouts", icon: "💰" },
  { href: "/owner/documents", label: "Documents", icon: "📁" },
  { href: "/owner/statements", label: "Statements", icon: "📄" },
  { href: "/owner/taxes", label: "1099 Forms", icon: "📑" },
];

export function OwnerLayout({ children, currentPath }: { children: ReactNode; currentPath?: string }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <h1 className="text-lg font-bold" style={{ color: "#0f3c52" }}>RentVue</h1>
          <p className="text-[10px] text-gray-400 mt-0.5">Owner Portal</p>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {ownerNavItems.map(item => (
            <a
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                currentPath === item.href
                  ? "text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
              style={currentPath === item.href ? { backgroundColor: "#0f3c52" } : {}}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-100">
          <div className="text-xs text-gray-500 mb-2">{user?.name} ({user?.email})</div>
          <button
            onClick={() => { logout(); navigate({ to: "/login" }); }}
            className="w-full text-left text-xs text-red-500 hover:text-red-700 font-medium"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
