import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "~/lib/layout";
import { properties, formatCurrency, formatDate, getStatusColor } from "~/lib/data";
import { useStore } from "~/lib/store";

export const Route = createFileRoute("/tenants")({
  component: TenantsPage,
});

function TenantsPage() {
  const { tenants } = useStore();
  const longTermTenants = tenants.filter(t => t.type === "tenant");
  const shortTermGuests = tenants.filter(t => t.type === "guest");

  return (
    <DashboardLayout currentPath="/tenants">
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tenants & Guests</h1>
            <p className="mt-1 text-sm text-gray-500">Manage {tenants.length} tenants and guests</p>
          </div>
          <button className="btn-primary gap-2">
            <span>+</span> Add Tenant
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
          <div className="stat-card">
            <p className="text-sm text-gray-500">Total</p>
            <p className="text-3xl font-bold mt-1">{tenants.length}</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-gray-500">Long-term Tenants</p>
            <p className="text-3xl font-bold mt-1">{longTermTenants.length}</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-gray-500">Checked-in Guests</p>
            <p className="text-3xl font-bold mt-1">{shortTermGuests.filter(g => g.checkoutStatus === "checked-in").length}</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-gray-500">Upcoming Bookings</p>
            <p className="text-3xl font-bold mt-1">{shortTermGuests.filter(g => g.checkoutStatus === "upcoming").length}</p>
          </div>
        </div>

        {/* Long-term Tenants */}
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold">Long-term Tenants</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">Name</th>
                  <th className="text-left px-6 py-3 font-medium">Property</th>
                  <th className="text-left px-6 py-3 font-medium">Email</th>
                  <th className="text-right px-6 py-3 font-medium">Rent</th>
                  <th className="text-left px-6 py-3 font-medium">Lease Period</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {longTermTenants.map((tenant) => {
                  const property = properties.find(p => p.id === tenant.propertyId);
                  return (
                    <tr key={tenant.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium">{tenant.name}</td>
                      <td className="px-6 py-3">
                        <a href={`/properties/${tenant.propertyId}`} className="text-[#0f3c52] hover:underline">
                          {property?.name ?? "—"}
                        </a>
                      </td>
                      <td className="px-6 py-3 text-gray-500">{tenant.email}</td>
                      <td className="px-6 py-3 text-right font-medium">{formatCurrency(tenant.rentAmount || 0)}</td>
                      <td className="px-6 py-3 text-gray-500">
                        {tenant.leaseStart && tenant.leaseEnd
                          ? `${formatDate(tenant.leaseStart)} — ${formatDate(tenant.leaseEnd)}`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
                {longTermTenants.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">No long-term tenants</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Short-term Guests */}
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold">Short-term Guests</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">Name</th>
                  <th className="text-left px-6 py-3 font-medium">Property</th>
                  <th className="text-left px-6 py-3 font-medium">Status</th>
                  <th className="text-left px-6 py-3 font-medium">Stay Dates</th>
                  <th className="text-right px-6 py-3 font-medium">Nightly Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shortTermGuests.map((guest) => {
                  const property = properties.find(p => p.id === guest.propertyId);
                  return (
                    <tr key={guest.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium">{guest.name}</td>
                      <td className="px-6 py-3">
                        <a href={`/properties/${guest.propertyId}`} className="text-[#0f3c52] hover:underline">
                          {property?.name ?? "—"}
                        </a>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`badge ${getStatusColor(guest.checkoutStatus || "upcoming")}`}>
                          {guest.checkoutStatus}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-500">
                        {guest.bookingStart && guest.bookingEnd
                          ? `${formatDate(guest.bookingStart)} — ${formatDate(guest.bookingEnd)}`
                          : "—"}
                      </td>
                      <td className="px-6 py-3 text-right">{formatCurrency(guest.nightlyRate || 0)}</td>
                    </tr>
                  );
                })}
                {shortTermGuests.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">No short-term guests</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}