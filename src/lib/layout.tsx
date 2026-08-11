import { useState, useEffect, useMemo, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "~/lib/auth";
import {
  AddPropertyModal, AddOccupantModal, AddMaintenanceModal,
  type QuickAddType,
} from "./forms";
import { formatDate, formatCurrency } from "./data";
import { useStore } from "./store";

const navItems = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/assistant", label: "Assistant", icon: "🧠" },
  { href: "/calendar", label: "Calendar", icon: "📅" },
  { href: "/plan", label: "Plan", icon: "📋" },
  { href: "/properties", label: "Properties", icon: "🏠" },
  { href: "/owners", label: "Owners", icon: "🏦" },
  { href: "/tenants", label: "Tenants & Guests", icon: "👥" },
  { href: "/payments", label: "Payments", icon: "💳" },
  { href: "/maintenance", label: "Maintenance", icon: "🔧" },
  { href: "/vendors", label: "Vendors", icon: "🛠️" },
  { href: "/payouts", label: "Owner Payouts", icon: "💰" },
  { href: "/owner", label: "Owner Portal", icon: "👤" },
  { href: "/reports", label: "Reports", icon: "📈" },
  { href: "/integrations", label: "Integrations", icon: "🔌" },
  { href: "/accounting", label: "Accounting", icon: "🧾" },
  { href: "/taxes", label: "1099 Taxes", icon: "📄" },
  { href: "/housekeeping", label: "Housekeeping", icon: "🧹" },
  { href: "/documents", label: "Documents", icon: "📁" },
  { href: "/documents/templates", label: "Templates", icon: "📄" },
  { href: "/leads", label: "Leads", icon: "📋" },
  { href: "/users", label: "Users", icon: "👥" },
];

export function DashboardLayout({ children, currentPath = "" }: { children: ReactNode; currentPath?: string }) {
  const { isAuthenticated, logout, user } = useAuth();
  const { bookings, tenants } = useStore();
  const navigate = useNavigate();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddType, setQuickAddType] = useState<QuickAddType | null>(null);
  const [showLogout, setShowLogout] = useState(false);
  const [guestSearch, setGuestSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [planTier, setPlanTier] = useState<string | null>(null);

  const searchResults = useMemo(() => {
    if (!guestSearch || guestSearch.length < 2) return [];
    const q = guestSearch.toLowerCase();
    const bookingResults = bookings.filter(b => b.guestName.toLowerCase().includes(q) || b.guestEmail?.toLowerCase().includes(q) || b.id.toLowerCase().includes(q) || b.reservationNumber.toLowerCase().includes(q));
    const tenantResults = tenants.filter(t => t.name.toLowerCase().includes(q));
    return { bookings: bookingResults, tenants: tenantResults, totalBookings: bookingResults.length, totalTenants: tenantResults.length };
  }, [guestSearch, bookings, tenants]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && guestSearch.trim().length >= 2) {
      window.location.href = "/search?q=" + encodeURIComponent(guestSearch.trim());
      setShowSearch(false);
    }
  };

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate({ to: "/login" });
    } else if (user && user.emailVerified === false && user.companyId !== "00000000-0000-0000-0000-000000000001") {
      navigate({ to: "/verify-pending" });
    }
  }, [isAuthenticated, user, navigate]);

  if (!isAuthenticated) return null;
  if (user && user.emailVerified === false && user.companyId !== "00000000-0000-0000-0000-000000000001") return null;

  // Fetch real plan tier
  useEffect(() => {
    if (!user?.companyId) return;
    import("~/lib/db-queries").then(({ fetchCompanyPlan }) => {
      fetchCompanyPlan({ data: { companyId: user.companyId! } }).then(tier => {
        setPlanTier(typeof tier === "string" ? tier : null);
      }).catch(() => {});
    });
  }, [user?.companyId]);

  const openForm = (type: QuickAddType) => {
    setShowQuickAdd(false);
    setQuickAddType(type);
  };  

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-30 flex h-dvh w-64 flex-col" style={{ backgroundColor: "#0f3c52" }}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
          <span className="text-2xl">🏘️</span>
          <div>
            <h1 className="text-lg font-bold text-white">RentMore</h1>
            <p className="text-xs text-gray-300">Property Management</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = currentPath === item.href || 
              (item.href !== "/" && currentPath.startsWith(item.href));
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={(e) => { e.preventDefault(); const href = item.href; setTimeout(() => { window.location.href = href + "?v=" + Date.now(); }, 100); }}
                className={`sidebar-link ${isActive ? "sidebar-link-active" : "sidebar-link-inactive"}`}
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/10 px-6 py-4">
          <p className="text-xs text-gray-400">RentMore v1.0.0</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-64 flex-1">
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-sm border-b border-gray-200 px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">Welcome back,</span>
              <span className="text-sm font-semibold">{user?.name || "Property Manager"}</span>
              {user?.role && (
                <span className={`badge text-[10px] ${user.role === "admin" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"}`}>{user.role}</span>
              )}
            </div>
            <div className="flex items-center gap-4">
              {/* Guest Search */}
              <div className="relative">
                <input
                  type="text"
                  className="input-field text-sm w-56 pl-8"
                  placeholder="Search guests..."
                  value={guestSearch}
                  onChange={e => { setGuestSearch(e.target.value); setShowSearch(true); }}
                  onFocus={() => setShowSearch(true)}
                  onBlur={() => setTimeout(() => setShowSearch(false), 200)}
                  onKeyDown={handleSearchKeyDown}
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                {showSearch && guestSearch.length >= 2 && (
                  <div className="absolute left-0 top-full mt-1 z-30 w-72 card shadow-lg py-1 max-h-80 overflow-y-auto">
                    {searchResults && (searchResults.bookings.length > 0 || searchResults.tenants.length > 0) ? (
                      <>
                        {searchResults.bookings.length > 0 && (
                          <div>
                            <p className="px-3 py-1 text-[10px] text-gray-400 uppercase font-medium">Bookings</p>
                            {searchResults.bookings.slice(0, 5).map(b => (
                              <a key={b.id} href={`/bookings/${b.id}`} className="block px-3 py-2 hover:bg-gray-50 text-sm">
                                <span className="font-medium">{b.guestName}</span>
                                <span className="text-gray-400 ml-2 text-xs">{formatDate(b.startDate)} — {formatDate(b.endDate)}</span>
                              </a>
                            ))}
                            {searchResults.totalBookings > 5 && (
                              <a href={`/search?q=${encodeURIComponent(guestSearch)}`} className="block px-3 py-2 text-xs text-[#0f3c52] font-medium hover:bg-gray-50 border-t">
                                See all {searchResults.totalBookings} results →
                              </a>
                            )}
                          </div>
                        )}
                        {searchResults.tenants.length > 0 && (
                          <div>
                            <p className="px-3 py-1 text-[10px] text-gray-400 uppercase font-medium border-t">Tenants</p>
                            {searchResults.tenants.map(t => (
                              <a key={t.id} href={`/tenants`} className="block px-3 py-2 hover:bg-gray-50 text-sm">
                                <span className="font-medium">{t.name}</span>
                                <span className="text-gray-400 ml-2 text-xs">{t.email}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="px-3 py-2 text-xs text-gray-400">No results for "{guestSearch}"</p>
                    )}
                  </div>
                )}
              </div>
              {/* Quick Add Button */}
              <div className="relative">
                <button
                  onClick={() => setShowQuickAdd(!showQuickAdd)}
                  className="btn-accent gap-1.5"
                >
                  <span className="text-lg leading-none">+</span>
                  <span>Quick Add</span>
                </button>
                {showQuickAdd && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowQuickAdd(false)} />
                    <div className="absolute right-0 top-full mt-1 z-20 w-52 card shadow-lg py-1">
                      <button onClick={() => { setShowQuickAdd(false); setTimeout(() => { window.location.href = "/add-property?v=" + Date.now(); }, 100); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-3">
                        <span>🏠</span> Add Property
                      </button>
                      <button onClick={() => openForm("occupant")} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-3">
                        <span>👤</span> Add Occupant
                      </button>
                      <button onClick={() => openForm("maintenance")} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-3">
                        <span>🔧</span> Add Maintenance
                      </button>
                    </div>
                  </>
                )}
              </div>
              <span className={`badge ${planBadgeClass(planTier, user?.companyId)}`}>{planLabel(planTier, user?.companyId)}</span>
              {/* User dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowLogout(!showLogout)}
                  className="h-8 w-8 rounded-full bg-[#0f3c52] text-white flex items-center justify-center text-sm font-medium hover:bg-[#0a2d3e] transition-colors cursor-pointer"
                >
                  {user?.name?.charAt(0) || "PM"}
                </button>
                {showLogout && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowLogout(false)} />
                    <div className="absolute right-0 top-full mt-1 z-20 w-48 card shadow-lg py-1">
                      <div className="px-4 py-2 border-b border-gray-100">
                        <p className="text-sm font-medium">{user?.name}</p>
                        <p className="text-xs text-gray-400">{user?.email}</p>
                        {user?.role && <span className={`badge text-[10px] mt-1 inline-block ${user.role === "admin" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"}`}>{user.role}</span>}
                      </div>
                      <button onClick={() => { setShowLogout(false); logout(); }} className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                        <span>🚪</span> Sign Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="p-8">
          {children}
        </div>
      </main>

      {/* Form Modals */}
      <AddPropertyModal isOpen={quickAddType === "property"} onClose={() => setQuickAddType(null)} />
      <AddOccupantModal isOpen={quickAddType === "occupant"} onClose={() => setQuickAddType(null)} />
      <AddMaintenanceModal isOpen={quickAddType === "maintenance"} onClose={() => setQuickAddType(null)} />
    </div>
  );
}

function planLabel(tier: string | null, companyId?: string): string {
  if (companyId === "00000000-0000-0000-0000-000000000001") return "Demo";
  if (!tier || tier === "free") return "Free";
  if (tier === "starter") return "Starter";
  if (tier === "growth") return "Growth";
  if (tier === "pro") return "Pro";
  if (tier === "enterprise") return "Enterprise";
  if (tier.endsWith("_pending")) {
    const base = tier.replace("_pending", "");
    return base.charAt(0).toUpperCase() + base.slice(1) + " (pending)";
  }
  return tier;
}

function planBadgeClass(tier: string | null, companyId?: string): string {
  if (companyId === "00000000-0000-0000-0000-000000000001") return "bg-gray-100 text-gray-600";
  if (!tier || tier === "free") return "bg-gray-100 text-gray-600";
  if (tier.includes("_pending")) return "bg-amber-100 text-amber-800";
  return "bg-green-100 text-green-800";
}
