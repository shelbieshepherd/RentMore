import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { DashboardLayout } from "~/lib/layout";
import {
  formatCurrency, formatDate, getStatusColor, feeConfig, calculateFees,
} from "~/lib/data";
import { useStore } from "~/lib/store";

export const Route = createFileRoute("/")({
  component: DashboardHome,
});

function DashboardHome() {
  const { properties, tenants, payments, maintenanceRequests, bookings, calendarBlocks } = useStore();
  const totalProperties = properties.length;
  const occupiedProperties = properties.filter(p => p.status === "occupied").length;
  const totalTenants = tenants.filter(t => t.type === "tenant").length;
  const activeGuests = tenants.filter(t => t.type === "guest" && t.checkoutStatus === "checked-in").length;
  const upcomingGuests = tenants.filter(t => t.type === "guest" && t.checkoutStatus === "upcoming").length;
  const pendingPayments = payments.filter(p => p.status === "pending").length;
  const overduePayments = payments.filter(p => p.status === "overdue").length;
  const openMaintenance = maintenanceRequests.filter(m => m.status === "open" || m.status === "in-progress").length;

  // Check-in / Check-out counts
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const checkinsToday = bookings.filter(b => b.status !== "cancelled" && b.startDate === today);
  const checkinsTomorrow = bookings.filter(b => b.status !== "cancelled" && b.startDate === tomorrow);
  const checkoutsToday = bookings.filter(b => b.status !== "cancelled" && b.endDate === today);
  const checkoutsTomorrow = bookings.filter(b => b.status !== "cancelled" && b.endDate === tomorrow);
  const [expandedArrivals, setExpandedArrivals] = useState<string | null>(null);

  // Availability search
  const [availStart, setAvailStart] = useState(today);
  const [availEnd, setAvailEnd] = useState(tomorrow);
  const [searched, setSearched] = useState(false);

  const isAvailable = (propId: string, start: string, end: string) => {
    const hasBooking = bookings.some(b => b.propertyId === propId && b.status !== "cancelled" && b.startDate <= end && b.endDate >= start);
    const hasBlock = calendarBlocks.some(b => b.propertyId === propId && b.startDate <= end && b.endDate >= start);
    return !hasBooking && !hasBlock;
  };

  const availableProps = useMemo(() => {
    if (!searched || !availStart || !availEnd) return [];
    return properties.filter(p => p.type === "short-term" && isAvailable(p.id, availStart, availEnd));
  }, [searched, availStart, availEnd, bookings, calendarBlocks]);

  // Booking modal from search
  const [bookNowProp, setBookNowProp] = useState<string>("");
  const [bookGuestName, setBookGuestName] = useState("");
  const [bookGuestEmail, setBookGuestEmail] = useState("");
  const [bookGuestPhone, setBookGuestPhone] = useState("");
  const [bookGuestAddress, setBookGuestAddress] = useState("");
  const [bookCleaningFee, setBookCleaningFee] = useState(feeConfig.cleaningFee);
  const [bookLinenFee, setBookLinenFee] = useState(feeConfig.linenFee);
  const [bookCommission, setBookCommission] = useState(feeConfig.commissionRate * 100);
  const [bookNightlyRate, setBookNightlyRate] = useState(0);
  const [bookSuccess, setBookSuccess] = useState(false);

  const openBookNow = (propId: string) => {
    setBookNowProp(propId);
    setBookGuestName("");
    setBookGuestEmail("");
    setBookGuestPhone("");
    setBookCleaningFee(feeConfig.cleaningFee);
    setBookLinenFee(feeConfig.linenFee);
    setBookCommission(feeConfig.commissionRate * 100);
    const pp = properties.find(p => p.id === propId);
    setBookNightlyRate(pp?.nightlyRate || (pp?.monthlyRent ? Math.round(pp.monthlyRent / 30) : 0));
    setBookSuccess(false);
  };

  const submitBookNow = (e: React.FormEvent) => {
    e.preventDefault();
    setBookSuccess(true);
    setTimeout(() => { setBookNowProp(""); setBookSuccess(false); }, 1500);
  };

  const recentPayments = payments.filter(p => p.status === "paid").slice(-5).reverse();
  const recentActivity = [
    ...payments.filter(p => p.status === "paid").map(p => ({ type: "payment" as const, label: `Payment received: ${p.description}`, date: p.date, propertyId: p.propertyId })),
    ...maintenanceRequests.map(m => ({ type: "maintenance" as const, label: `Maintenance ${m.status}: ${m.description.slice(0, 40)}...`, date: m.dateReported, propertyId: m.propertyId })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

  return (
    <DashboardLayout currentPath="/">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Overview of your property portfolio</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-3">
                <span className="text-xl">🏠</span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Properties</p>
                <p className="text-2xl font-bold">{totalProperties}</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-400">{occupiedProperties} occupied · {totalProperties - occupiedProperties} vacant</p>
          </div>

          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-50 p-3">
                <span className="text-xl">👥</span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Tenants & Guests</p>
                <p className="text-2xl font-bold">{totalTenants + activeGuests}</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-400">{totalTenants} tenants · {activeGuests} checked-in · {upcomingGuests} upcoming</p>
          </div>

          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-yellow-50 p-3">
                <span className="text-xl">💳</span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Pending Payments</p>
                <p className="text-2xl font-bold">{pendingPayments + overduePayments}</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-400">{pendingPayments} pending · {overduePayments} overdue</p>
          </div>

          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-50 p-3">
                <span className="text-xl">🔧</span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Open Maintenance</p>
                <p className="text-2xl font-bold">{openMaintenance}</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-400">{maintenanceRequests.filter(m => m.status === "open").length} open · {maintenanceRequests.filter(m => m.status === "in-progress").length} in progress</p>
          </div>
        </div>

        {/* Arrivals & Departures */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {([
            { key: "checkin-today", label: "Check-ins Today", icon: "🛬", count: checkinsToday.length, color: "bg-green-50", list: checkinsToday, emptyText: "No check-ins today" },
            { key: "checkin-tomorrow", label: "Check-ins Tomorrow", icon: "🛬", count: checkinsTomorrow.length, color: "bg-blue-50", list: checkinsTomorrow, emptyText: "No check-ins tomorrow" },
            { key: "checkout-today", label: "Check-outs Today", icon: "🛫", count: checkoutsToday.length, color: "bg-orange-50", list: checkoutsToday, emptyText: "No check-outs today" },
            { key: "checkout-tomorrow", label: "Check-outs Tomorrow", icon: "🛫", count: checkoutsTomorrow.length, color: "bg-purple-50", list: checkoutsTomorrow, emptyText: "No check-outs tomorrow" },
          ] as const).map(({ key, label, icon, count, color, list, emptyText }) => (
            <div key={key}>
              <div
                className={`stat-card cursor-pointer hover:shadow-md transition-shadow ${expandedArrivals === key ? "ring-2 ring-[#0f3c52]" : ""}`}
                onClick={() => setExpandedArrivals(expandedArrivals === key ? null : key)}
              >
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-3 ${color}`}>
                    <span className="text-xl">{icon}</span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">{label}</p>
                    <p className="text-2xl font-bold">{count}</p>
                  </div>
                </div>
              </div>
              {expandedArrivals === key && (
                <div className="card mt-2 p-3 animate-in">
                  {list.length === 0 ? (
                    <p className="text-sm text-gray-400 py-2 text-center">{emptyText}</p>
                  ) : (
                    <div className="space-y-2">
                      {list.map(b => {
                        const prop = properties.find(p => p.id === b.propertyId);
                        const nights = Math.ceil((new Date(b.endDate).getTime() - new Date(b.startDate).getTime()) / 86400000);
                        return (
                          <a
                            key={b.id}
                            href={`/bookings/${b.id}`}
                            className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 border border-gray-100"
                          >
                            <div>
                              <p className="text-sm font-medium text-gray-800">{b.guestName}</p>
                              <p className="text-xs text-gray-500">{prop?.name || b.propertyId} · {nights} nights</p>
                            </div>
                            <span className={`badge text-[10px] ${b.source === "airbnb" ? "bg-red-100 text-red-700" : b.source === "booking.com" ? "bg-blue-100 text-blue-700" : b.source === "vrbo" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>{b.source}</span>
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Availability Search */}
        <div className="card p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-700">🔍 Quick Availability Check</h3>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Check-in</label>
              <input type="date" className="input-field text-sm w-40" value={availStart} onChange={e => { setAvailStart(e.target.value); setSearched(false); }} />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Check-out</label>
              <input type="date" className="input-field text-sm w-40" value={availEnd} onChange={e => { setAvailEnd(e.target.value); setSearched(false); }} />
            </div>
            <button onClick={() => setSearched(true)} className="btn-accent text-sm px-4">Search</button>
          </div>
          {searched && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              {availableProps.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {availableProps.map(p => {
                    const nights = Math.max(1, Math.ceil((new Date(availEnd).getTime() - new Date(availStart).getTime()) / 86400000));
                    return (
                      <div key={p.id} className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                        <div className="w-10 h-10 rounded-lg bg-green-200 flex items-center justify-center text-lg">🏠</div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{p.name}</p>
                          <p className="text-xs text-gray-500">{nights} nights · {formatCurrency((p.nightlyRate || p.monthlyRent / 30) * nights)} est.</p>
                        </div>
                        <span className="badge bg-green-200 text-green-800 ml-auto shrink-0">Available</span>
                        <button onClick={() => openBookNow(p.id)} className="text-[10px] px-2 py-0.5 rounded font-medium bg-green-600 text-white hover:bg-green-700 ml-1 shrink-0">Book Now</button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-2">No short-term properties available for {availStart} → {availEnd}. Try different dates.</p>
              )}
            </div>
          )}
        </div>

        {/* Fee & Tax Configuration */}
        <details className="card p-4 group">
          <summary className="cursor-pointer text-sm font-semibold text-gray-700 select-none">⚙️ Fee & Tax Settings</summary>
          <div className="mt-3 pt-3 border-t grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="text-gray-500 block mb-1">Tax Rate (%)</label>
              <input type="number" className="input-field" value={feeConfig.taxRate * 100} onChange={e => { feeConfig.taxRate = Number(e.target.value) / 100; }} step="0.1" min="0" max="25" />
            </div>
            <div>
              <label className="text-gray-500 block mb-1">Cleaning Fee ($)</label>
              <input type="number" className="input-field" value={feeConfig.cleaningFee} onChange={e => { feeConfig.cleaningFee = Number(e.target.value); }} min="0" />
            </div>
            <div>
              <label className="text-gray-500 block mb-1">Linen Fee ($)</label>
              <input type="number" className="input-field" value={feeConfig.linenFee} onChange={e => { feeConfig.linenFee = Number(e.target.value); }} min="0" />
            </div>
            <div>
              <label className="text-gray-500 block mb-1">Commission (%)</label>
              <input type="number" className="input-field" value={feeConfig.commissionRate * 100} onChange={e => { feeConfig.commissionRate = Number(e.target.value) / 100; }} step="0.5" min="0" max="50" />
            </div>
          </div>
        </details>

        {/* Today at a Glance */}
        {(() => {
          const checkins = bookings.filter(b => b.startDate === today && b.status !== "cancelled");
          const checkouts = bookings.filter(b => b.endDate === today && b.status !== "cancelled");
          if (checkins.length === 0 && checkouts.length === 0) return null;
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">🟢</span>
                  <h3 className="text-sm font-semibold text-gray-700">Today's Check-Ins ({checkins.length})</h3>
                </div>
                {checkins.length === 0 ? (
                  <p className="text-xs text-gray-400">No check-ins today</p>
                ) : (
                  <div className="space-y-2">
                    {checkins.map(b => {
                      const prop = properties.find(p => p.id === b.propertyId);
                      return (
                        <div key={b.id} className="flex items-center justify-between p-2 bg-green-50 rounded-lg">
                          <div>
                            <p className="text-sm font-medium">{b.guestName}</p>
                            <p className="text-xs text-gray-500">{prop?.name} · {formatDate(b.startDate)} → {formatDate(b.endDate)}</p>
                          </div>
                          <span className="text-xs font-medium text-green-700">{b.source}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">🔴</span>
                  <h3 className="text-sm font-semibold text-gray-700">Today's Check-Outs ({checkouts.length})</h3>
                </div>
                {checkouts.length === 0 ? (
                  <p className="text-xs text-gray-400">No check-outs today</p>
                ) : (
                  <div className="space-y-2">
                    {checkouts.map(b => {
                      const prop = properties.find(p => p.id === b.propertyId);
                      return (
                        <div key={b.id} className="flex items-center justify-between p-2 bg-red-50 rounded-lg">
                          <div>
                            <p className="text-sm font-medium">{b.guestName}</p>
                            <p className="text-xs text-gray-500">{prop?.name} · {formatDate(b.startDate)} → {formatDate(b.endDate)}</p>
                          </div>
                          <span className="text-xs font-medium text-red-700">{b.source}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Payments */}
          <div className="lg:col-span-2 card">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Recent Payments</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {recentPayments.map((payment) => (
                <div key={payment.id} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{payment.description}</p>
                    <p className="text-xs text-gray-500">{formatDate(payment.date)} · {payment.method}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{formatCurrency(payment.amount)}</span>
                    <span className={`badge ${getStatusColor(payment.status)}`}>{payment.status}</span>
                  </div>
                </div>
              ))}
              {recentPayments.length === 0 && (
                <p className="px-6 py-4 text-sm text-gray-400">No recent payments.</p>
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="card">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Recent Activity</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {recentActivity.map((activity, i) => (
                <div key={i} className="px-6 py-3">
                  <div className="flex items-start gap-3">
                    <span className="text-lg mt-0.5">
                      {activity.type === "payment" ? "💳" : "🔧"}
                    </span>
                    <div>
                      <p className="text-sm">{activity.label}</p>
                      <p className="text-xs text-gray-400">{formatDate(activity.date)}</p>
                    </div>
                  </div>
                </div>
              ))}
              {recentActivity.length === 0 && (
                <p className="px-6 py-4 text-sm text-gray-400">No recent activity.</p>
              )}
            </div>
          </div>
        </div>

        {/* Properties Overview */}
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Properties Overview</h2>
            <a href="/properties" className="text-sm font-medium" style={{ color: "#0f3c52" }}>View all →</a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">Property</th>
                  <th className="text-left px-6 py-3 font-medium">Type</th>
                  <th className="text-left px-6 py-3 font-medium">Status</th>
                  <th className="text-right px-6 py-3 font-medium">Rent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {properties.map((property) => (
                  <tr key={property.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <a href={`/properties/${property.id}`} className="font-medium hover:underline" style={{ color: "#0f3c52" }}>
                        {property.name}
                      </a>
                    </td>
                    <td className="px-6 py-3 text-gray-500">{property.type}</td>
                    <td className="px-6 py-3">
                      <span className={`badge ${getStatusColor(property.status)}`}>{property.status}</span>
                    </td>
                    <td className="px-6 py-3 text-right font-medium">{formatCurrency(property.monthlyRent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Book Now Modal */}
      {bookNowProp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !bookSuccess && setBookNowProp("")}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{bookSuccess ? "Booking Confirmed!" : "Book Now"}</h2>
              <button onClick={() => setBookNowProp("")} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            {bookSuccess ? (
              <div className="px-6 py-12 text-center">
                <div className="text-4xl mb-3">✅</div>
                <p className="text-lg font-medium text-green-600">Reservation created!</p>
                <p className="text-sm text-gray-500 mt-1">{bookGuestName} · {availStart} → {availEnd}</p>
              </div>
            ) : (
              <form onSubmit={submitBookNow} className="p-6 space-y-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm font-semibold">{properties.find(p=>p.id===bookNowProp)?.name}</p>
                  <p className="text-xs text-gray-500">{availStart} → {availEnd}</p>
                  {(() => {
                    const pp = properties.find(p=>p.id===bookNowProp);
                    const defaultRate = pp?.nightlyRate || (pp?.monthlyRent ? Math.round(pp.monthlyRent / 30) : 0);
                    const rate = bookNightlyRate || defaultRate;
                    const n = Math.max(1, Math.ceil((new Date(availEnd).getTime() - new Date(availStart).getTime()) / 86400000));
                    const subtotal = n * rate;
                    const localTax = n >= 185 ? 0 : Math.round(subtotal * feeConfig.taxRate * 100) / 100;
                    const localComm = Math.round((subtotal + bookCleaningFee + bookLinenFee) * (bookCommission / 100) * 100) / 100;
                    const total = subtotal + bookCleaningFee + bookLinenFee + localTax;
                    return (
                      <div className="mt-2 pt-2 border-t space-y-1 text-xs">
                        <div className="flex justify-between items-center"><span className="text-gray-500">$/night</span><input type="number" className="w-20 text-right text-xs border rounded px-1 py-0.5" value={rate} onChange={e => setBookNightlyRate(Number(e.target.value))} min={0} /></div>
                        <div className="flex justify-between"><span className="text-gray-500">{n} nights × {formatCurrency(rate)}</span><span>{formatCurrency(subtotal)}</span></div>
                        <div className="flex justify-between items-center"><span className="text-gray-500">Cleaning $</span><input type="number" className="w-20 text-right text-xs border rounded px-1 py-0.5" value={bookCleaningFee} onChange={e => setBookCleaningFee(Number(e.target.value))} min={0} /></div>
                        <div className="flex justify-between items-center"><span className="text-gray-500">Linen $</span><input type="number" className="w-20 text-right text-xs border rounded px-1 py-0.5" value={bookLinenFee} onChange={e => setBookLinenFee(Number(e.target.value))} min={0} /></div>
                        <div className="flex justify-between items-center"><span className="text-gray-500">Commission %</span><input type="number" className="w-20 text-right text-xs border rounded px-1 py-0.5" value={bookCommission} onChange={e => setBookCommission(Number(e.target.value))} min={0} max={50} step={0.5} /></div>
                        <div className="flex justify-between"><span className="text-gray-500">Tax (8.5%)</span><span>{n >= 185 ? "Exempt" : formatCurrency(localTax)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Commission</span><span>{formatCurrency(localComm)}</span></div>
                        <div className="flex justify-between font-bold pt-1 border-t"><span>Total</span><span>{formatCurrency(total)}</span></div>
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Guest Name</label>
                  <input className="input-field" value={bookGuestName} onChange={e => setBookGuestName(e.target.value)} placeholder="Enter guest name" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Guest Email</label>
                  <input className="input-field" type="email" value={bookGuestEmail} onChange={e => setBookGuestEmail(e.target.value)} placeholder="guest@email.com" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <input className="input-field" value={bookGuestAddress} onChange={e => setBookGuestAddress(e.target.value)} placeholder="Guest address" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input className="input-field" type="tel" value={bookGuestPhone} onChange={e => setBookGuestPhone(e.target.value)} placeholder="(555) 000-0000" />
                </div>
                <button type="submit" className="btn-accent w-full">Confirm Booking</button>
              </form>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}