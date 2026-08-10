import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "~/lib/auth";
import { OwnerLayout } from "~/lib/owner-layout";
import { useStore } from "~/lib/store";
import { formatCurrency, formatDate, calculateFees } from "~/lib/data";

export const Route = createFileRoute("/owner/")({ component: OwnerDashboard });

function OwnerDashboard() {
  const { user } = useAuth();
  const store = useStore();
  const ownerId = user?.ownerId;
  const myProperties = store.properties.filter(p => p.ownerId === ownerId);
  const myPropertyIds = myProperties.map(p => p.id);
  const myBookings = store.bookings.filter(b => myPropertyIds.includes(b.propertyId));
  const upcomingBookings = myBookings.filter(b => b.status === "confirmed" || b.status === "checked-in");
  const myPayouts = store.ownerPayouts.filter(p => p.ownerId === ownerId);
  const recentPayouts = myPayouts.slice(0, 3);
  const totalPending = myPayouts.filter(p => p.status === "pending").reduce((s, p) => s + p.amount, 0);

  return (
    <OwnerLayout currentPath="/owner">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Welcome, {user?.name}</h1>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card p-4">
            <p className="text-xs text-gray-500 uppercase mb-1">My Properties</p>
            <p className="text-2xl font-bold" style={{ color: "#0f3c52" }}>{myProperties.length}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500 uppercase mb-1">Upcoming Bookings</p>
            <p className="text-2xl font-bold" style={{ color: "#0f3c52" }}>{upcomingBookings.length}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500 uppercase mb-1">Pending Payouts</p>
            <p className="text-2xl font-bold text-amber-600">{formatCurrency(totalPending)}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500 uppercase mb-1">Total Payouts</p>
            <p className="text-2xl font-bold text-green-600">
              {formatCurrency(myPayouts.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0))}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* My Properties */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">🏠 My Properties</h3>
            {myProperties.length === 0 ? (
              <p className="text-sm text-gray-400">No properties found.</p>
            ) : (
              <div className="space-y-3">
                {myProperties.map(p => (
                  <div key={p.id} className="flex justify-between items-start border-b border-gray-50 pb-3 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.address}</p>
                      <span className={`badge text-[10px] ${p.type === "short-term" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"} mt-1 inline-block`}>
                        {p.type === "short-term" ? "Short-term" : "Long-term"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Bookings */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">📅 Upcoming Bookings</h3>
            {upcomingBookings.length === 0 ? (
              <p className="text-sm text-gray-400">No upcoming bookings.</p>
            ) : (
              <div className="space-y-3">
                {upcomingBookings.slice(0, 5).map(b => {
                  const p = myProperties.find(x => x.id === b.propertyId);
                  return (
                    <div key={b.id} className="flex justify-between items-start border-b border-gray-50 pb-3 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{b.guestName}</p>
                        <p className="text-xs text-gray-500">{p?.name || "Unknown"} • {formatDate(b.startDate)} – {formatDate(b.endDate)}</p>
                      </div>
                      <span className={`badge text-xs ${b.status === "confirmed" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                        {b.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Recent Payouts */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">💰 Recent Payouts</h3>
          {recentPayouts.length === 0 ? (
            <p className="text-sm text-gray-400">No payouts yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-gray-400 border-b">
                  <tr>
                    <th className="text-left py-2 font-medium">Period</th>
                    <th className="text-left py-2 font-medium">Amount</th>
                    <th className="text-left py-2 font-medium">Status</th>
                    <th className="text-left py-2 font-medium">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayouts.map(op => (
                    <tr key={op.id} className="border-b border-gray-50">
                      <td className="py-2 text-gray-500">{op.period}</td>
                      <td className="py-2 font-medium">{formatCurrency(op.amount)}</td>
                      <td className="py-2">
                        <span className={`badge text-[10px] ${op.status === "paid" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                          {op.status}
                        </span>
                      </td>
                      <td className="py-2 text-gray-500">{op.datePaid ? formatDate(op.datePaid) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </OwnerLayout>
  );
}
