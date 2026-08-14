import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { DashboardLayout } from "~/lib/layout";
import { formatDate, formatCurrency } from "~/lib/data";
import { useStore } from "~/lib/store";

export const Route = createFileRoute("/search")({
  component: SearchPage,
});

function SearchPage() {
  const store = useStore();
  const bookings = store.bookings;
  const properties = store.properties;
  const tenants = store.tenants;

  // Read query from URL
  const [rawQuery, setRawQuery] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("q") || "";
    }
    return "";
  });

  const results = useMemo(() => {
    if (!rawQuery || rawQuery.length < 2) return { bookings: [], tenants: [] };
    const q = rawQuery.toLowerCase();
    const bookingResults = bookings.filter(b =>
      b.guestName.toLowerCase().includes(q) ||
      b.guestEmail?.toLowerCase().includes(q) ||
      b.id.toLowerCase().includes(q) ||
      b.reservationNumber.toLowerCase().includes(q) ||
      b.propertyId.toLowerCase().includes(q)
    );
    const tenantResults = tenants.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.email.toLowerCase().includes(q)
    );
    return { bookings: bookingResults, tenants: tenantResults };
  }, [rawQuery, bookings]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const input = (e.target as HTMLFormElement).querySelector("input") as HTMLInputElement;
    setRawQuery(input.value);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("q", input.value);
      window.history.replaceState({}, "", url.toString());
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      confirmed: "bg-blue-100 text-blue-800",
      "checked-in": "bg-green-100 text-green-800",
      "checked-out": "bg-gray-100 text-gray-600",
      cancelled: "bg-red-100 text-red-800",
    };
    return colors[status] || "bg-gray-100 text-gray-600";
  };

  return (
    <DashboardLayout currentPath="/search">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Search</h1>
          <p className="mt-1 text-sm text-gray-500">Find bookings by guest name, email, or property</p>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            className="input-field flex-1"
            placeholder="Search guests, emails, properties..."
            defaultValue={rawQuery}
            autoFocus
          />
          <button type="submit" className="btn-accent" style={{ backgroundColor: "#0f3c52" }}>
            🔍 Search
          </button>
        </form>

        {/* Results */}
        {rawQuery.length >= 2 ? (
          <div className="space-y-6">
            {/* Booking Results */}
            <div>
              <h2 className="text-lg font-semibold mb-3">
                Bookings
                <span className="text-gray-400 font-normal ml-2 text-sm">
                  {results.bookings.length} result{results.bookings.length !== 1 ? "s" : ""}
                </span>
              </h2>
              {results.bookings.length > 0 ? (
                <div className="card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Guest</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Property</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Dates</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Amount</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Ref #</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {results.bookings.map(b => {
                          const prop = properties.find(p => p.id === b.propertyId);
                          const isCancelled = b.status === "cancelled";
                          return (
                            <tr
                              key={b.id}
                              className={`hover:bg-gray-50 cursor-pointer ${isCancelled ? "opacity-60" : ""}`}
                              onClick={() => window.location.href = `/bookings/${b.id}`}
                            >
                              <td className="px-4 py-3">
                                <p className={`font-medium ${isCancelled ? "line-through" : ""}`}>{b.guestName}</p>
                                {b.guestEmail && <p className="text-xs text-gray-400">{b.guestEmail}</p>}
                              </td>
                              <td className="px-4 py-3 text-gray-600">{prop?.name || b.propertyId}</td>
                              <td className="px-4 py-3 text-gray-500 text-xs">
                                {formatDate(b.startDate)} — {formatDate(b.endDate)}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`badge text-xs ${statusBadge(b.status)}`}>{b.status}</span>
                              </td>
                              <td className={`px-4 py-3 text-right font-medium ${isCancelled ? "line-through text-gray-400" : ""}`}>
                                {formatCurrency(b.totalAmount)}
                              </td>
                              <td className="px-4 py-3 text-right text-xs text-gray-400 font-mono">
                                {b.id.replace("b", "000")}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-gray-400 text-sm py-8 text-center bg-gray-50 rounded-lg">
                  No bookings match "{rawQuery}"
                </p>
              )}
            </div>

            {/* Tenant Results */}
            {results.tenants.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3">
                  Tenants
                  <span className="text-gray-400 font-normal ml-2 text-sm">{results.tenants.length} result{results.tenants.length !== 1 ? "s" : ""}</span>
                </h2>
                <div className="card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Phone</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Property</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {results.tenants.map(t => {
                        const prop = properties.find(p => p.id === t.propertyId);
                        return (
                          <tr key={t.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium">{t.name}</td>
                            <td className="px-4 py-3 text-gray-500">{t.email}</td>
                            <td className="px-4 py-3 text-gray-500">{t.phone}</td>
                            <td className="px-4 py-3 text-gray-600">{prop?.name || t.propertyId}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-400 text-sm py-12 text-center">
            {rawQuery.length > 0 ? "Type at least 2 characters to search" : "Enter a name, email, or property to find bookings"}
          </p>
        )}
      </div>
    </DashboardLayout>
  );
}
