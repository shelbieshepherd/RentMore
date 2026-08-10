import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { DashboardLayout } from "~/lib/layout";
import { useStore } from "~/lib/store";
import { formatCurrency } from "~/lib/data";

export const Route = createFileRoute("/taxes")({
  component: TaxesPage,
});

function TaxesPage() {
  const { owners, properties, bookings, payments, maintenanceRequests } = useStore();
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2];
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedOwner, setSelectedOwner] = useState<string>("all");

  // Map propertyId -> ownerId for quick lookup
  const propOwnerMap = useMemo(() => {
    const m = new Map<string, string>();
    properties.forEach(p => { m.set(p.id, p.ownerId); });
    return m;
  }, [properties]);

  // Calculate real-data owner income
  const ownerIncome = useMemo(() => {
    const yearStart = `${selectedYear}-01-01`;
    const yearEnd = `${selectedYear}-12-31`;

    return owners.map(owner => {
      const ownerProps = properties.filter(p => p.ownerId === owner.id);
      const ownerPropIds = new Set(ownerProps.map(p => p.id));

      // Bookings for this owner in the selected year (by startDate, non-cancelled)
      const ownerBookings = bookings.filter(b => {
        if (!ownerPropIds.has(b.propertyId)) return false;
        if (b.status === "cancelled") return false;
        return b.startDate >= yearStart && b.startDate <= yearEnd;
      });

      // Gross: sum of booking totalAmount
      const gross = ownerBookings.reduce((s, b) => s + b.totalAmount, 0);

      // Commissions: sum of (totalAmount * commissionRate)
      const commissions = ownerBookings.reduce(
        (s, b) => s + Math.round(b.totalAmount * b.commissionRate * 100) / 100, 0
      );

      // Maintenance deductions: sum of cost (in cents) where chargedToOwner=true
      const maintenance = maintenanceRequests
        .filter(m => m.chargedToOwner && ownerPropIds.has(m.propertyId))
        .reduce((s, m) => s + (m.cost || 0), 0);

      const net = gross - commissions - maintenance;

      return {
        owner,
        properties: ownerProps,
        gross,
        commissions,
        maintenance,
        net,
        bookingCount: ownerBookings.length,
        qualifiesFor1099: gross >= 60000, // $600 threshold
      };
    }).filter(o => o.gross > 0 || o.maintenance > 0);
  }, [owners, properties, bookings, maintenanceRequests, selectedYear]);

  const filteredOwners = selectedOwner === "all"
    ? ownerIncome
    : ownerIncome.filter(o => o.owner.id === selectedOwner);

  const totalGross = ownerIncome.reduce((s, o) => s + o.gross, 0);
  const totalCommissions = ownerIncome.reduce((s, o) => s + o.commissions, 0);
  const totalMaintenance = ownerIncome.reduce((s, o) => s + o.maintenance, 0);
  const totalNet = ownerIncome.reduce((s, o) => s + o.net, 0);
  const taxableCount = ownerIncome.filter(o => o.qualifiesFor1099).length;

  const exportCSV = () => {
    const rows = filteredOwners.map(o =>
      `"${o.owner.name}","${o.owner.tin}","${o.gross / 100}","${o.commissions / 100}","${o.maintenance / 100}","${o.net / 100}","${o.qualifiesFor1099 ? "Yes" : "No"}"`
    ).join("\n");
    const blob = new Blob(["Owner,TIN,Gross,Commissions,Maintenance,Net,1099-Eligible\n" + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `rentvue-1099-${selectedYear}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout currentPath="/taxes">
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">1099 Tax Reporting</h1>
            <p className="mt-1 text-sm text-gray-500">Year-end tax documents for property owners</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={exportCSV} className="btn-secondary gap-2 text-sm">
              📥 Export CSV
            </button>
            <button className="btn-primary gap-2 text-sm">
              🖨️ Print Forms
            </button>
          </div>
        </div>

        {/* Year selector + owner filter */}
        <div className="flex items-center gap-4">
          <select className="input-field w-32" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="input-field w-48" value={selectedOwner} onChange={e => setSelectedOwner(e.target.value)}>
            <option value="all">All Owners</option>
            {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-6">
          <div className="stat-card">
            <p className="text-sm text-gray-500">Total Owners</p>
            <p className="text-3xl font-bold mt-1">{ownerIncome.length}</p>
            <p className="text-xs text-gray-400 mt-1">{taxableCount} qualify for 1099</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-gray-500">Gross Income</p>
            <p className="text-3xl font-bold mt-1 text-green-600">{formatCurrency(totalGross)}</p>
            <p className="text-xs text-gray-400 mt-1">{selectedYear}</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-gray-500">Commissions</p>
            <p className="text-3xl font-bold mt-1 text-red-500">{formatCurrency(totalCommissions)}</p>
            <p className="text-xs text-gray-400 mt-1">Per-booking rates</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-gray-500">Maintenance</p>
            <p className="text-3xl font-bold mt-1 text-orange-500">{formatCurrency(totalMaintenance)}</p>
            <p className="text-xs text-gray-400 mt-1">Owner-charged</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-gray-500">Net Income</p>
            <p className="text-3xl font-bold mt-1" style={{ color: "#0f3c52" }}>{formatCurrency(totalNet)}</p>
            <p className="text-xs text-gray-400 mt-1">After all deductions</p>
          </div>
        </div>

        {/* 1099 forms for each owner */}
        {filteredOwners.map((item, idx) => (
          <div key={item.owner.id} className="card" id={`form-${item.owner.id}`}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Form 1099-MISC — {item.owner.name}</h2>
                <p className="text-sm text-gray-500">Tax Year {selectedYear}</p>
              </div>
              <div className="flex items-center gap-3">
                {item.qualifiesFor1099 && (
                  <span className="badge bg-yellow-100 text-yellow-800">1099 Required</span>
                )}
                <button className="btn-secondary text-xs px-3 py-1">📥 Download</button>
              </div>
            </div>

            <div className="p-6">
              {/* 1099-MISC fields */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">PAYER</p>
                  <p className="text-sm font-medium mt-1">RentVue Property Management</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">RECIPIENT</p>
                  <p className="text-sm font-medium mt-1">{item.owner.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">TAX YEAR</p>
                  <p className="text-sm font-medium mt-1">{selectedYear}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">RECIPIENT TIN</p>
                  <p className="text-sm font-medium mt-1">{item.owner.tin || "[On file]"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">RECIPIENT EMAIL</p>
                  <p className="text-sm text-gray-400 mt-1">{item.owner.email}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">PROPERTIES</p>
                  <p className="text-sm text-gray-400 mt-1">{item.properties.map(p => p.name).join(", ")}</p>
                </div>
              </div>

              {/* Box cards */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="border-2 border-gray-300 rounded-lg p-4">
                  <p className="text-xs text-gray-500 font-semibold">Box 1: Rents</p>
                  <p className="text-3xl font-bold mt-1">{formatCurrency(item.gross)}</p>
                  <p className="text-xs text-gray-400 mt-1">{item.bookingCount} bookings</p>
                </div>
                <div className="border-2 border-gray-300 rounded-lg p-4">
                  <p className="text-xs text-gray-500 font-semibold">Commissions</p>
                  <p className="text-3xl font-bold mt-1 text-red-500">{formatCurrency(item.commissions)}</p>
                  <p className="text-xs text-gray-400 mt-1">Per-booking rates</p>
                </div>
                <div className="border-2 border-gray-300 rounded-lg p-4">
                  <p className="text-xs text-gray-500 font-semibold">Maintenance</p>
                  <p className="text-3xl font-bold mt-1 text-orange-500">{formatCurrency(item.maintenance)}</p>
                  <p className="text-xs text-gray-400 mt-1">Owner-charged</p>
                </div>
                <div className="border-2 rounded-lg p-4" style={{ borderColor: "#0f3c52", backgroundColor: "#f8fafc" }}>
                  <p className="text-xs font-semibold" style={{ color: "#0f3c52" }}>Net Income</p>
                  <p className="text-3xl font-bold mt-1" style={{ color: "#0f3c52" }}>{formatCurrency(item.net)}</p>
                  <p className="text-xs text-gray-400 mt-1">Reportable on 1099-MISC</p>
                </div>
              </div>
            </div>
          </div>
        ))}

        {filteredOwners.length === 0 && (
          <div className="text-center py-20">
            <div className="text-4xl mb-3">📄</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">No 1099 data for {selectedYear}</h2>
            <p className="text-gray-500">No bookings or maintenance found for this tax year.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
