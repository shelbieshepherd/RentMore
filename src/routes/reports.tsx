import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { DashboardLayout } from "~/lib/layout";
import { formatCurrency, formatDate, getStatusColor, type Booking, type OwnerPayout, type PayoutMethod, owners as seedOwners } from "~/lib/data";
import { useStore } from "~/lib/store";
import { fetchTaxRate, upsertTaxRate } from "~/lib/db-queries";

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
});

const today = new Date();
const todayStr = today.toISOString().slice(0, 10);
const days7 = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);
const days30 = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);
const days90 = new Date(today.getTime() + 90 * 86400000).toISOString().slice(0, 10);
const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10);
const currentMonth = today.toISOString().slice(0, 7); // YYYY-MM

type Preset = "today" | "7d" | "30d" | "90d";
type ActiveTab = "financial" | "guests" | "taxes";

// ── Generic CSV export ──
function exportCsv(headers: string[], rows: string[][], filename: string) {
  const lines = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportReportCsv(rows: (Booking & { propertyName: string })[], filename: string) {
  const header = ["Guest", "Property", "Check-in", "Check-out", "Amount", "Source", "Status"];
  const lines = rows.map((r) => [
    r.guestName || "",
    r.propertyName,
    r.startDate, r.endDate,
    String(r.totalAmount), r.source, r.status,
  ]);
  exportCsv(header, lines, filename);
}

function PresetButtons({ preset, onPreset }: { preset: Preset; onPreset: (p: Preset) => void }) {
  const items: { key: Preset; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "7d", label: "7 days" },
    { key: "30d", label: "30 days" },
    { key: "90d", label: "90 days" },
  ];
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {items.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onPreset(key)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            preset === key ? "text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
          style={preset === key ? { backgroundColor: "#0f3c52" } : undefined}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function nightsBetween(start: string, end: string) {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000);
}

function monthStart(ym: string) { return `${ym}-01`; }
function monthEnd(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`;
}

// ── Tab button helper ──
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium ${
        active ? "text-white" : "bg-gray-100 text-gray-600"
      }`}
      style={active ? { backgroundColor: "#0f3c52" } : undefined}
    >
      {children}
    </button>
  );
}

// ── Owner Payout Report (within Taxes tab) ──
type PayoutReportPreset = "7d" | "30d" | "this-month";

function OwnerPayoutReport({
  ownerPayouts,
  owners,
  properties,
  bookings,
}: {
  ownerPayouts: OwnerPayout[];
  owners: any[];
  properties: any[];
  bookings: Booking[];
}) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const monthStartStr = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

  const [preset, setPreset] = useState<PayoutReportPreset>("this-month");
  const [from, setFrom] = useState(monthStartStr);
  const [to, setTo] = useState(todayStr);

  function applyPreset(p: PayoutReportPreset) {
    setPreset(p);
    if (p === "7d") { setFrom(sevenDaysAgo); setTo(todayStr); }
    else if (p === "30d") { setFrom(thirtyDaysAgo); setTo(todayStr); }
    else { setFrom(monthStartStr); setTo(todayStr); }
  }

  const paidPayouts = useMemo(() => {
    return ownerPayouts
      .filter((op) => op.status === "paid" && op.datePaid && op.datePaid >= from && op.datePaid <= to)
      .sort((a, b) => (b.datePaid || "").localeCompare(a.datePaid || ""));
  }, [ownerPayouts, from, to]);

  // Compute room rate + commission from bookings for each payout row
  const reportRows = useMemo(() => {
    return paidPayouts.map((op) => {
      const owner = owners.find((o) => o.id === op.ownerId);
      const property = properties.find((p) => p.id === op.propertyId);
      const ownerName = owner?.name || op.ownerId;
      const propertyName = property?.name || op.propertyId;

      // Compute from bookings for this property/period: sum totalAmount, commission = total × commissionRate
      const periodBookings = bookings.filter((b) =>
        b.propertyId === op.propertyId &&
        b.status !== "cancelled"
      );
      const roomRate = periodBookings.reduce((s, b) => s + b.totalAmount, 0);
      const commission = periodBookings.reduce((s, b) => s + Math.round(b.totalAmount * b.commissionRate), 0);
      const netPaid = roomRate - commission;

      return {
        id: op.id,
        ownerName,
        propertyName,
        period: op.period,
        roomRate,
        commission,
        netPaid,
        method: op.method,
        datePaid: op.datePaid,
      };
    });
  }, [paidPayouts, owners, properties, bookings]);

  const totalNet = reportRows.reduce((s, r) => s + r.netPaid, 0);

  const exportCSV = () => {
    const headers = ["Owner", "Property", "Period", "Room Rate", "Commission", "Net Paid", "Method"];
    const rows = reportRows.map((r) => [
      r.ownerName, r.propertyName, r.period,
      String(r.roomRate), String(r.commission), String(r.netPaid),
      r.method || "",
    ]);
    const lines = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `owner-payout-report-${from}-to-${to}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const printPDF = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const rowsHtml = reportRows.map((r) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${r.ownerName}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${r.propertyName}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${r.period}</td>
        <td style="padding:8px;text-align:right;border-bottom:1px solid #e5e7eb;">${formatCurrency(r.roomRate)}</td>
        <td style="padding:8px;text-align:right;border-bottom:1px solid #e5e7eb;">${formatCurrency(r.commission)}</td>
        <td style="padding:8px;text-align:right;border-bottom:1px solid #e5e7eb;">${formatCurrency(r.netPaid)}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${r.method || ""}</td>
      </tr>
    `).join("");
    const totalHtml = `
      <tr style="font-weight:bold;background:#f9fafb;">
        <td style="padding:8px;" colspan="5">Total Net Paid</td>
        <td style="padding:8px;text-align:right;">${formatCurrency(totalNet)}</td>
        <td></td>
      </tr>
    `;
    printWindow.document.write(`
      <html>
        <head><title>Owner Payout Report</title>
        <style>
          body { font-family: system-ui, sans-serif; margin: 40px; color: #111; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          .date { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th { text-align: left; padding: 8px; background: #f3f4f6; border-bottom: 2px solid #d1d5db; }
        </style></head>
        <body>
          <h1>RentMore — Owner Payout Report</h1>
          <p class="date">${from} to ${to}</p>
          <table>
            <thead><tr>
              <th>Owner</th><th>Property</th><th>Period</th>
              <th style="text-align:right">Room Rate</th><th style="text-align:right">Commission</th>
              <th style="text-align:right">Net Paid</th><th>Method</th>
            </tr></thead>
            <tbody>${rowsHtml}${reportRows.length > 0 ? totalHtml : ""}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const methodBadge = (m?: PayoutMethod) => {
    if (!m) return null;
    return (
      <span className={`badge text-xs ${m === "ACH" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}`}>
        {m}
      </span>
    );
  };

  return (
    <div className="card">
      <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg font-semibold">🏦 Owner Payout Report</h2>
        <div className="flex items-center gap-2">
          {reportRows.length > 0 && (
            <>
              <button onClick={exportCSV} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200">
                📥 Export CSV
              </button>
              <button onClick={printPDF} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white hover:opacity-90" style={{ backgroundColor: "#0f3c52" }}>
                🖨️ Print PDF
              </button>
            </>
          )}
        </div>
      </div>
      <div className="p-4 sm:p-6 space-y-4">
        {/* Date range presets */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 mr-1">Period:</span>
          {([
            { key: "7d", label: "Last 7 Days" },
            { key: "30d", label: "Last 30 Days" },
            { key: "this-month", label: "This Month" },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                preset === key ? "text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
              style={preset === key ? { backgroundColor: "#0f3c52" } : undefined}
            >
              {label}
            </button>
          ))}
          <div className="flex items-center gap-1 ml-2">
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset(e.target.value === monthStartStr && to === todayStr ? "this-month" : e.target.value === sevenDaysAgo ? "7d" : e.target.value === thirtyDaysAgo ? "30d" : "this-month" as PayoutReportPreset); }} className="text-xs border border-gray-200 rounded px-2 py-1" />
            <span className="text-xs text-gray-400">to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="text-xs border border-gray-200 rounded px-2 py-1" />
          </div>
        </div>

        {/* Empty state */}
        {reportRows.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <p className="text-lg mb-1">No paid payouts in this period</p>
            <p className="text-xs">Payouts marked as "paid" on the Payouts page will appear here.</p>
          </div>
        )}

        {reportRows.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-3">Owner</th>
                    <th className="text-left px-4 py-3">Property</th>
                    <th className="text-left px-4 py-3">Period</th>
                    <th className="text-right px-4 py-3">Room Rate</th>
                    <th className="text-right px-4 py-3">Commission</th>
                    <th className="text-right px-4 py-3">Net Paid</th>
                    <th className="text-left px-4 py-3">Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reportRows.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{r.ownerName}</td>
                      <td className="px-4 py-3">{r.propertyName}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{r.period}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(r.roomRate)}</td>
                      <td className="px-4 py-3 text-right text-red-600">{formatCurrency(r.commission)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-green-600">{formatCurrency(r.netPaid)}</td>
                      <td className="px-4 py-3">{methodBadge(r.method)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td className="px-4 py-3" colSpan={5}>Total Net Paid</td>
                    <td className="px-4 py-3 text-right text-green-600">{formatCurrency(totalNet)}</td>
                    <td className="px-4 py-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReportsPage() {
  const { properties, payments, maintenanceRequests, bookings, companyId, ownerPayouts } = useStore();
  const owners = seedOwners;
  const [activeTab, setActiveTab] = useState<ActiveTab>("financial");

  // ── Financial tab data ──
  const totalCollected = payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const totalOverdue = payments.filter((p) => p.status === "overdue").reduce((s, p) => s + p.amount, 0);
  const totalPending = payments.filter((p) => p.status === "pending").reduce((s, p) => s + p.amount, 0);
  const occRate = properties.filter((p) => p.status === "occupied").length;
  const maintCost = maintenanceRequests.filter((m) => m.status === "resolved").length * 150;

  // ── Guest Activity state ──
  const [ciPreset, setCiPreset] = useState<Preset>("7d");
  const [ciFrom, setCiFrom] = useState(sevenDaysAgo);
  const [ciTo, setCiTo] = useState(todayStr);
  const [coPreset, setCoPreset] = useState<Preset>("7d");
  const [coFrom, setCoFrom] = useState(sevenDaysAgo);
  const [coTo, setCoTo] = useState(todayStr);

  function applyCiPreset(p: Preset) {
    setCiPreset(p);
    if (p === "today") { setCiFrom(todayStr); setCiTo(todayStr); }
    else if (p === "7d") { setCiFrom(sevenDaysAgo); setCiTo(todayStr); }
    else if (p === "30d") { setCiFrom(todayStr); setCiTo(days30); }
    else if (p === "90d") { setCiFrom(todayStr); setCiTo(days90); }
  }
  function applyCoPreset(p: Preset) {
    setCoPreset(p);
    if (p === "today") { setCoFrom(todayStr); setCoTo(todayStr); }
    else if (p === "7d") { setCoFrom(sevenDaysAgo); setCoTo(todayStr); }
    else if (p === "30d") { setCoFrom(todayStr); setCoTo(days30); }
    else if (p === "90d") { setCoFrom(todayStr); setCoTo(days90); }
  }

  const checkInRows = useMemo(() => {
    return bookings
      .filter((b) => b.status !== "cancelled" && b.startDate >= ciFrom && b.startDate <= ciTo)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .map((b) => ({ ...b, propertyName: properties.find((p) => p.id === b.propertyId)?.name ?? "Unknown" }));
  }, [bookings, ciFrom, ciTo, properties]);

  const checkOutRows = useMemo(() => {
    return bookings
      .filter((b) => b.status !== "cancelled" && b.endDate >= coFrom && b.endDate <= coTo)
      .sort((a, b) => a.endDate.localeCompare(b.endDate))
      .map((b) => ({ ...b, propertyName: properties.find((p) => p.id === b.propertyId)?.name ?? "Unknown" }));
  }, [bookings, coFrom, coTo, properties]);

  // ── Taxes & Fees state ──
  const [taxMonth, setTaxMonth] = useState(currentMonth);
  const [taxRate, setTaxRate] = useState(0.085); // NH 8.5%

  // Load tax rate from DB on mount; persist changes
  const [taxRateLoaded, setTaxRateLoaded] = useState(false);
  useEffect(() => {
    fetchTaxRate({ data: { companyId } }).then((dbRate) => {
      if (dbRate !== null) setTaxRate(dbRate);
      setTaxRateLoaded(true);
    }).catch(() => setTaxRateLoaded(true));
  }, [companyId]);

  // Persist tax rate to DB when it changes (after initial load)
  useEffect(() => {
    if (!taxRateLoaded) return;
    upsertTaxRate({ data: { companyId, rate: taxRate } }).catch(() => {});
  }, [taxRate, taxRateLoaded, companyId]);

  const monthFirst = monthStart(taxMonth);
  const monthLast = monthEnd(taxMonth);

  // Shared lookup helper
  const propById = useMemo(() => {
    const m: Record<string, (typeof properties)[0]> = {};
    for (const p of properties) m[p.id] = p;
    return m;
  }, [properties]);

  // a. NH Rooms & Meals Tax — short-term bookings overlapping the month
  const nhTaxRows = useMemo(() => {
    return bookings
      .filter((b) => {
        if (b.status === "cancelled") return false;
        const prop = propById[b.propertyId];
        if (!prop || prop.type !== "short-term") return false;
        // Booking overlaps the selected month
        return b.startDate <= monthLast && b.endDate >= monthFirst;
      })
      .map((b) => {
        const prop = propById[b.propertyId];
        // Nights that fall within the month
        const stayStart = b.startDate > monthFirst ? b.startDate : monthFirst;
        const stayEnd = b.endDate < monthLast ? b.endDate : monthLast;
        const monthNights = Math.max(1, nightsBetween(stayStart, stayEnd));
        const monthRevenue = monthNights * b.nightlyRate;
        const taxOwed = Math.round(monthRevenue * taxRate * 100) / 100;
        return {
          id: b.id,
          property: prop?.name ?? "Unknown",
          guest: b.guestName,
          bookings: 1,
          nights: monthNights,
          revenue: monthRevenue,
          taxOwed,
        };
      });
  }, [bookings, propById, monthFirst, monthLast, taxRate]);

  // Aggregate NH tax by property
  const nhTaxByProp = useMemo(() => {
    const map: Record<string, { property: string; bookings: number; nights: number; revenue: number; taxOwed: number }> = {};
    for (const r of nhTaxRows) {
      const key = r.property;
      if (!map[key]) map[key] = { property: key, bookings: 0, nights: 0, revenue: 0, taxOwed: 0 };
      map[key].bookings += 1;
      map[key].nights += r.nights;
      map[key].revenue += r.revenue;
      map[key].taxOwed += r.taxOwed;
    }
    return Object.values(map);
  }, [nhTaxRows]);

  const nhTaxTotal = nhTaxByProp.reduce((s, x) => s + x.taxOwed, 0);
  const nhRevenueTotal = nhTaxByProp.reduce((s, x) => s + x.revenue, 0);

  // b. Commission — per owner
  const commissionRows = useMemo(() => {
    const ownerMap: Record<string, { owner: string; gross: number; commission: number; count: number }> = {};
    for (const b of bookings) {
      if (b.status === "cancelled") continue;
      // Booking overlaps the month
      if (!(b.startDate <= monthLast && b.endDate >= monthFirst)) continue;
      const prop = propById[b.propertyId];
      if (!prop) continue;
      const ownerId = prop.ownerId || "unassigned";
      const owner = ownerId !== "unassigned" ? (owners.find((o: any) => o.id === ownerId)?.name ?? "Unassigned") : "Unassigned";
      if (!ownerMap[owner]) ownerMap[owner] = { owner, gross: 0, commission: 0, count: 0 };
      ownerMap[owner].gross += b.totalAmount;
      ownerMap[owner].commission += Math.round(b.totalAmount * (b.commissionRate || 0) * 100) / 100;
      ownerMap[owner].count += 1;
    }
    return Object.values(ownerMap).sort((a, b) => b.commission - a.commission);
  }, [bookings, propById, monthFirst, monthLast, owners]);

  const commissionTotal = commissionRows.reduce((s, x) => s + x.commission, 0);

  // c. Cleaning & Linen Fees — per property
  const cleaningLinenRows = useMemo(() => {
    const map: Record<string, { property: string; cleaning: number; linen: number; combined: number }> = {};
    for (const b of bookings) {
      if (b.status === "cancelled") continue;
      if (!(b.startDate <= monthLast && b.endDate >= monthFirst)) continue;
      const prop = propById[b.propertyId];
      if (!prop) continue;
      const key = prop.name;
      if (!map[key]) map[key] = { property: key, cleaning: 0, linen: 0, combined: 0 };
      map[key].cleaning += b.cleaningFee || 0;
      map[key].linen += b.linenFee || 0;
      map[key].combined += (b.cleaningFee || 0) + (b.linenFee || 0);
    }
    return Object.values(map).filter((x) => x.combined > 0);
  }, [bookings, propById, monthFirst, monthLast]);

  const cleanLinenTotal = cleaningLinenRows.reduce((s, x) => s + x.combined, 0);

  // d. Guest-paid convenience fees — paid payments in the month
  const processingFeeRows = useMemo(() => {
    const paidInMonth = payments.filter((p) => {
      if (p.status !== "paid") return false;
      if (p.method === "check" || p.method === "utility" || p.method === "deposit" || p.method === "refund") return false;
      const dt = p.date || p.dueDate;
      return dt >= monthFirst && dt <= monthLast;
    });
    return paidInMonth.map((p) => {
      const prop = propById[p.propertyId];
      return {
        id: p.id,
        date: p.date || p.dueDate,
        property: prop?.name ?? "Unknown",
        description: p.description,
        amount: p.amount,
        method: p.method,
        fee: p.method === "credit card" ? p.amount * 0.035 : p.method === "ACH" ? p.amount * 0.01 + 0.25 : 0,
      };
    });
  }, [payments, propById, monthFirst, monthLast]);

  const pfCcTotal = processingFeeRows.filter((x) => x.method === "credit card").reduce((s, x) => s + x.fee, 0);
  const pfAchTotal = processingFeeRows.filter((x) => x.method === "ACH").reduce((s, x) => s + x.fee, 0);

  // ── Render ──
  const ciRevenue = checkInRows.reduce((s, b) => s + b.totalAmount, 0);
  const ciNights = checkInRows.reduce((s, b) => s + nightsBetween(b.startDate, b.endDate), 0);
  const coRevenue = checkOutRows.reduce((s, b) => s + b.totalAmount, 0);
  const coNights = checkOutRows.reduce((s, b) => s + nightsBetween(b.startDate, b.endDate), 0);

  return (
    <DashboardLayout currentPath="/reports">
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="mt-1 text-sm text-gray-500">Financial overview, guest operations, and tax filings</p>
        </div>

        {/* ── Tab bar ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <TabBtn active={activeTab === "financial"} onClick={() => setActiveTab("financial")}>📊 Financial Overview</TabBtn>
          <TabBtn active={activeTab === "guests"} onClick={() => setActiveTab("guests")}>👥 Guest Activity</TabBtn>
          <TabBtn active={activeTab === "taxes"} onClick={() => setActiveTab("taxes")}>🧾 Taxes &amp; Fees</TabBtn>
        </div>

        {/* ═══════ Financial Overview ═══════ */}
        {activeTab === "financial" && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="stat-card"><p className="text-sm text-gray-500">Occupancy Rate</p><p className="text-3xl font-bold mt-1">{Math.round((occRate / Math.max(1, properties.length)) * 100)}%</p></div>
              <div className="stat-card"><p className="text-sm text-gray-500">Total Collected</p><p className="text-3xl font-bold mt-1 text-green-600">{formatCurrency(totalCollected)}</p></div>
              <div className="stat-card"><p className="text-sm text-gray-500">Outstanding</p><p className="text-3xl font-bold mt-1 text-red-600">{formatCurrency(totalOverdue + totalPending)}</p></div>
              <div className="stat-card"><p className="text-sm text-gray-500">Est. Maintenance Costs</p><p className="text-3xl font-bold mt-1">{formatCurrency(maintCost)}</p></div>
            </div>
            <div className="card"><div className="px-6 py-4 border-b border-gray-100"><h2 className="text-lg font-semibold">Monthly Collections</h2></div><div className="p-6"><div className="h-16 flex items-end gap-4">{["May","Jun","Jul","Aug"].map(m => <div key={m} className="flex-1 bg-gray-100 rounded-t-lg h-12"></div>)}</div></div></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="card"><div className="px-6 py-4 border-b border-gray-100"><h2 className="text-lg font-semibold">Payment Method</h2></div><div className="p-4 space-y-3">
                <div className="flex justify-between text-sm"><span>Credit Card</span><span className="font-medium">{formatCurrency(payments.filter(p=>p.method==="credit card"&&p.status==="paid").reduce((s,p)=>s+p.amount,0))}</span></div>
                <div className="flex justify-between text-sm"><span>ACH</span><span className="font-medium">{formatCurrency(payments.filter(p=>p.method==="ACH"&&p.status==="paid").reduce((s,p)=>s+p.amount,0))}</span></div>
                <div className="flex justify-between text-sm"><span>Check</span><span className="font-medium">{formatCurrency(payments.filter(p=>p.method==="check"&&p.status==="paid").reduce((s,p)=>s+p.amount,0))}</span></div>
              </div></div>
              <div className="card"><div className="px-6 py-4 border-b border-gray-100"><h2 className="text-lg font-semibold">Property Type</h2></div><div className="p-4 space-y-3">
                <div className="flex justify-between text-sm"><span>Long-term Revenue</span><span className="font-medium">{formatCurrency(payments.filter(p=>{const pr=properties.find(x=>x.id===p.propertyId);return pr?.type==="long-term"&&p.status==="paid"}).reduce((s,p)=>s+p.amount,0))}</span></div>
                <div className="flex justify-between text-sm"><span>Short-term Revenue</span><span className="font-medium">{formatCurrency(payments.filter(p=>{const pr=properties.find(x=>x.id===p.propertyId);return pr?.type==="short-term"&&p.status==="paid"}).reduce((s,p)=>s+p.amount,0))}</span></div>
              </div></div>
            </div>
          </>
        )}

        {/* ═══════ Guest Activity ═══════ */}
        {activeTab === "guests" && (
          <>
            {/* Check-in Report */}
            <div className="card">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h2 className="text-lg font-semibold">🟢 Check-in Report</h2>
                <button onClick={() => exportReportCsv(checkInRows, `check-ins-${ciFrom}-to-${ciTo}.csv`)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200" disabled={checkInRows.length === 0}>📥 Export CSV</button>
              </div>
              <div className="p-4 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-sm font-medium text-gray-700">From</label>
                    <input type="date" className="input-field w-40 text-sm" value={ciFrom} onChange={e => { setCiFrom(e.target.value); setCiPreset("7d" as Preset); }} />
                    <label className="text-sm font-medium text-gray-700">To</label>
                    <input type="date" className="input-field w-40 text-sm" value={ciTo} onChange={e => { setCiTo(e.target.value); setCiPreset("7d" as Preset); }} />
                  </div>
                  <PresetButtons preset={ciPreset} onPreset={applyCiPreset} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="stat-card border-l-4 border-l-green-500"><p className="text-sm text-gray-500">Total Check-ins</p><p className="text-2xl font-bold mt-1 text-green-600">{checkInRows.length}</p></div>
                  <div className="stat-card border-l-4 border-l-blue-500"><p className="text-sm text-gray-500">Total Nights</p><p className="text-2xl font-bold mt-1 text-blue-600">{ciNights}</p></div>
                  <div className="stat-card border-l-4 border-l-purple-500"><p className="text-sm text-gray-500">Expected Revenue</p><p className="text-2xl font-bold mt-1 text-purple-600">{formatCurrency(ciRevenue)}</p></div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr><th className="text-left px-4 py-3">Guest</th><th className="text-left px-4 py-3">Property</th><th className="text-left px-4 py-3">Check-in</th><th className="text-left px-4 py-3">Check-out</th><th className="text-right px-4 py-3">Amount</th><th className="text-left px-4 py-3">Source</th><th className="text-left px-4 py-3">Status</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {checkInRows.map(b => (
                        <tr key={b.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{b.guestName}</td><td className="px-4 py-3">{b.propertyName}</td><td className="px-4 py-3">{formatDate(b.startDate)}</td><td className="px-4 py-3 text-gray-500">{formatDate(b.endDate)}</td><td className="px-4 py-3 text-right font-medium">{formatCurrency(b.totalAmount)}</td><td className="px-4 py-3 text-xs uppercase text-gray-400">{b.source}</td><td className="px-4 py-3"><span className={`badge ${getStatusColor(b.status)}`}>{b.status}</span></td>
                        </tr>
                      ))}
                      {checkInRows.length === 0 && <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">No check-ins in this range</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Check-out Report */}
            <div className="card">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h2 className="text-lg font-semibold">🔴 Check-out Report</h2>
                <button onClick={() => exportReportCsv(checkOutRows, `check-outs-${coFrom}-to-${coTo}.csv`)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200" disabled={checkOutRows.length === 0}>📥 Export CSV</button>
              </div>
              <div className="p-4 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-sm font-medium text-gray-700">From</label>
                    <input type="date" className="input-field w-40 text-sm" value={coFrom} onChange={e => { setCoFrom(e.target.value); setCoPreset("7d" as Preset); }} />
                    <label className="text-sm font-medium text-gray-700">To</label>
                    <input type="date" className="input-field w-40 text-sm" value={coTo} onChange={e => { setCoTo(e.target.value); setCoPreset("7d" as Preset); }} />
                  </div>
                  <PresetButtons preset={coPreset} onPreset={applyCoPreset} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="stat-card border-l-4 border-l-red-500"><p className="text-sm text-gray-500">Total Check-outs</p><p className="text-2xl font-bold mt-1 text-red-600">{checkOutRows.length}</p></div>
                  <div className="stat-card border-l-4 border-l-blue-500"><p className="text-sm text-gray-500">Total Nights</p><p className="text-2xl font-bold mt-1 text-blue-600">{coNights}</p></div>
                  <div className="stat-card border-l-4 border-l-purple-500"><p className="text-sm text-gray-500">Expected Revenue</p><p className="text-2xl font-bold mt-1 text-purple-600">{formatCurrency(coRevenue)}</p></div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr><th className="text-left px-4 py-3">Guest</th><th className="text-left px-4 py-3">Property</th><th className="text-left px-4 py-3">Check-in</th><th className="text-left px-4 py-3">Check-out</th><th className="text-right px-4 py-3">Amount</th><th className="text-left px-4 py-3">Source</th><th className="text-left px-4 py-3">Status</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {checkOutRows.map(b => (
                        <tr key={b.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{b.guestName}</td><td className="px-4 py-3">{b.propertyName}</td><td className="px-4 py-3">{formatDate(b.startDate)}</td><td className="px-4 py-3 text-gray-500">{formatDate(b.endDate)}</td><td className="px-4 py-3 text-right font-medium">{formatCurrency(b.totalAmount)}</td><td className="px-4 py-3 text-xs uppercase text-gray-400">{b.source}</td><td className="px-4 py-3"><span className={`badge ${getStatusColor(b.status)}`}>{b.status}</span></td>
                        </tr>
                      ))}
                      {checkOutRows.length === 0 && <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">No check-outs in this range</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Outstanding Balances */}
            <div className="card">
              <div className="px-6 py-4 border-b border-gray-100"><h2 className="text-lg font-semibold">💳 Outstanding Balances</h2></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr><th className="text-left px-6 py-3">Description</th><th className="text-left px-6 py-3">Property</th><th className="text-left px-6 py-3">Due Date</th><th className="text-right px-6 py-3">Amount</th><th className="text-left px-6 py-3">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {payments.filter(p => p.status === "pending" || p.status === "overdue").sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(p => {
                      const pr = properties.find(x => x.id === p.propertyId);
                      return (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-6 py-3 font-medium">{p.description}</td><td className="px-6 py-3">{pr?.name}</td><td className="px-6 py-3 text-gray-500">{formatDate(p.dueDate)}</td><td className="px-6 py-3 text-right font-medium">{formatCurrency(p.amount)}</td><td className="px-6 py-3"><span className={`badge ${getStatusColor(p.status)}`}>{p.status}</span></td>
                        </tr>
                      );
                    })}
                    {payments.filter(p => p.status === "pending" || p.status === "overdue").length === 0 && <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">All paid up! 🎉</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ═══════ Taxes & Fees ═══════ */}
        {activeTab === "taxes" && (
          <>
            {/* Month picker */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">Month</label>
              <input
                type="month"
                className="input-field w-44 text-sm"
                value={taxMonth}
                onChange={(e) => setTaxMonth(e.target.value)}
              />
            </div>

            {/* ── a. NH Rooms & Meals Tax ── */}
            <div className="card">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h2 className="text-lg font-semibold">🏛️ NH Rooms &amp; Meals Tax</h2>
                <button
                  onClick={() => {
                    exportCsv(
                      ["Property", "Bookings", "Nights", "Room Revenue", "Tax Owed"],
                      nhTaxByProp.map((r) => [r.property, String(r.bookings), String(r.nights), String(r.revenue), r.taxOwed.toFixed(2)]),
                      `nh-tax-${taxMonth}.csv`,
                    );
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200"
                  disabled={nhTaxByProp.length === 0}
                >
                  📥 Export CSV
                </button>
              </div>
              <div className="p-4 sm:p-6 space-y-4">
                {/* Editable rate */}
                <div className="flex items-center gap-2 bg-amber-50 rounded-lg px-4 py-3 text-sm">
                  <span className="font-medium text-amber-800">Tax Rate:</span>
                  <input
                    type="number"
                    className="w-20 input-field text-sm"
                    min={0} max={30} step={0.1}
                    value={Math.round(taxRate * 1000) / 10}
                    onChange={(e) => setTaxRate(Number(e.target.value) / 100)}
                  />
                  <span className="text-amber-700">%</span>
                  <span className="text-xs text-amber-600 ml-2">(default 8.5% NH Rooms &amp; Meals)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="stat-card border-l-4 border-l-amber-500">
                    <p className="text-sm text-gray-500">Taxable Bookings</p>
                    <p className="text-2xl font-bold mt-1 text-amber-600">{nhTaxRows.length}</p>
                  </div>
                  <div className="stat-card border-l-4 border-l-blue-500">
                    <p className="text-sm text-gray-500">Room Revenue</p>
                    <p className="text-2xl font-bold mt-1 text-blue-600">{formatCurrency(nhRevenueTotal)}</p>
                  </div>
                  <div className="stat-card border-l-4 border-l-red-500">
                    <p className="text-sm text-gray-500">Tax to Remit</p>
                    <p className="text-2xl font-bold mt-1 text-red-600">{formatCurrency(nhTaxTotal)}</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="text-left px-4 py-3">Property</th>
                        <th className="text-right px-4 py-3">Bookings</th>
                        <th className="text-right px-4 py-3">Nights</th>
                        <th className="text-right px-4 py-3">Room Revenue</th>
                        <th className="text-right px-4 py-3">Tax Owed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {nhTaxByProp.map((r) => (
                        <tr key={r.property} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{r.property}</td>
                          <td className="px-4 py-3 text-right">{r.bookings}</td>
                          <td className="px-4 py-3 text-right">{r.nights}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(r.revenue)}</td>
                          <td className="px-4 py-3 text-right font-medium text-amber-700">{formatCurrency(r.taxOwed)}</td>
                        </tr>
                      ))}
                      {nhTaxByProp.length === 0 && <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">No short-term stays in this month</td></tr>}
                    </tbody>
                    {nhTaxByProp.length > 0 && (
                      <tfoot className="bg-gray-50 font-semibold">
                        <tr>
                          <td className="px-4 py-3">Total</td>
                          <td className="px-4 py-3 text-right">{nhTaxByProp.reduce((s, x) => s + x.bookings, 0)}</td>
                          <td className="px-4 py-3 text-right">{nhTaxByProp.reduce((s, x) => s + x.nights, 0)}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(nhRevenueTotal)}</td>
                          <td className="px-4 py-3 text-right text-red-600">{formatCurrency(nhTaxTotal)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>

            {/* ── b. Commission Report ── */}
            <div className="card">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h2 className="text-lg font-semibold">💼 Commission</h2>
                <button
                  onClick={() => {
                    exportCsv(
                      ["Owner", "Gross Revenue", "Commission", "Bookings"],
                      commissionRows.map((r) => [r.owner, String(r.gross), r.commission.toFixed(2), String(r.count)]),
                      `commission-${taxMonth}.csv`,
                    );
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200"
                  disabled={commissionRows.length === 0}
                >
                  📥 Export CSV
                </button>
              </div>
              <div className="p-4 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="stat-card border-l-4 border-l-indigo-500"><p className="text-sm text-gray-500">Owners</p><p className="text-2xl font-bold mt-1 text-indigo-600">{commissionRows.length}</p></div>
                  <div className="stat-card border-l-4 border-l-green-500"><p className="text-sm text-gray-500">Gross Revenue</p><p className="text-2xl font-bold mt-1 text-green-600">{formatCurrency(commissionRows.reduce((s, x) => s + x.gross, 0))}</p></div>
                  <div className="stat-card border-l-4 border-l-purple-500"><p className="text-sm text-gray-500">Total Commission</p><p className="text-2xl font-bold mt-1 text-purple-600">{formatCurrency(commissionTotal)}</p></div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="text-left px-4 py-3">Owner</th>
                        <th className="text-right px-4 py-3">Gross Revenue</th>
                        <th className="text-right px-4 py-3">Commission</th>
                        <th className="text-right px-4 py-3">Bookings</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {commissionRows.map((r) => (
                        <tr key={r.owner} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{r.owner}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(r.gross)}</td>
                          <td className="px-4 py-3 text-right font-medium text-red-600">{formatCurrency(r.commission)}</td>
                          <td className="px-4 py-3 text-right">{r.count}</td>
                        </tr>
                      ))}
                      {commissionRows.length === 0 && <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400">No bookings in this month</td></tr>}
                    </tbody>
                    {commissionRows.length > 0 && (
                      <tfoot className="bg-gray-50 font-semibold">
                        <tr>
                          <td className="px-4 py-3">Total</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(commissionRows.reduce((s, x) => s + x.gross, 0))}</td>
                          <td className="px-4 py-3 text-right text-red-600">{formatCurrency(commissionTotal)}</td>
                          <td className="px-4 py-3 text-right">{commissionRows.reduce((s, x) => s + x.count, 0)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>

            {/* ── c. Cleaning & Linen Fees ── */}
            <div className="card">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h2 className="text-lg font-semibold">🧹 Cleaning &amp; Linen Fees</h2>
                <button
                  onClick={() => {
                    exportCsv(
                      ["Property", "Cleaning", "Linen", "Combined"],
                      cleaningLinenRows.map((r) => [r.property, String(r.cleaning), String(r.linen), String(r.combined)]),
                      `cleaning-linen-${taxMonth}.csv`,
                    );
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200"
                  disabled={cleaningLinenRows.length === 0}
                >
                  📥 Export CSV
                </button>
              </div>
              <div className="p-4 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="stat-card border-l-4 border-l-teal-500"><p className="text-sm text-gray-500">Cleaning Total</p><p className="text-2xl font-bold mt-1 text-teal-600">{formatCurrency(cleaningLinenRows.reduce((s, x) => s + x.cleaning, 0))}</p></div>
                  <div className="stat-card border-l-4 border-l-cyan-500"><p className="text-sm text-gray-500">Linen Total</p><p className="text-2xl font-bold mt-1 text-cyan-600">{formatCurrency(cleaningLinenRows.reduce((s, x) => s + x.linen, 0))}</p></div>
                  <div className="stat-card border-l-4 border-l-emerald-500"><p className="text-sm text-gray-500">Combined Total</p><p className="text-2xl font-bold mt-1 text-emerald-600">{formatCurrency(cleanLinenTotal)}</p></div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="text-left px-4 py-3">Property</th>
                        <th className="text-right px-4 py-3">Cleaning</th>
                        <th className="text-right px-4 py-3">Linen</th>
                        <th className="text-right px-4 py-3">Combined</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {cleaningLinenRows.map((r) => (
                        <tr key={r.property} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{r.property}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(r.cleaning)}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(r.linen)}</td>
                          <td className="px-4 py-3 text-right font-medium">{formatCurrency(r.combined)}</td>
                        </tr>
                      ))}
                      {cleaningLinenRows.length === 0 && <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400">No cleaning or linen fees recorded in this month</td></tr>}
                    </tbody>
                    {cleaningLinenRows.length > 0 && (
                      <tfoot className="bg-gray-50 font-semibold">
                        <tr>
                          <td className="px-4 py-3">Total</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(cleaningLinenRows.reduce((s, x) => s + x.cleaning, 0))}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(cleaningLinenRows.reduce((s, x) => s + x.linen, 0))}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(cleanLinenTotal)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>

            {/* ── d. Guest-Paid Convenience Fees ── */}
            <div className="card">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h2 className="text-lg font-semibold">💳 Guest-Paid Convenience Fees</h2>
                <button
                  onClick={() => {
                    exportCsv(
                      ["Date", "Property", "Description", "Amount", "Method", "Fee"],
                      processingFeeRows.map((r) => [r.date, r.property, r.description, String(r.amount), r.method, String(r.fee)]),
                      `processing-fees-${taxMonth}.csv`,
                    );
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200"
                  disabled={processingFeeRows.length === 0}
                >
                  📥 Export CSV
                </button>
              </div>
              <div className="p-4 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="stat-card border-l-4 border-l-orange-500"><p className="text-sm text-gray-500">Credit Card Fees</p><p className="text-2xl font-bold mt-1 text-orange-600">{formatCurrency(pfCcTotal)}</p></div>
                  <div className="stat-card border-l-4 border-l-blue-500"><p className="text-sm text-gray-500">ACH Fees</p><p className="text-2xl font-bold mt-1 text-blue-600">{formatCurrency(pfAchTotal)}</p></div>
                  <div className="stat-card border-l-4 border-l-slate-500"><p className="text-sm text-gray-500">Total Fees</p><p className="text-2xl font-bold mt-1 text-slate-600">{formatCurrency(pfCcTotal + pfAchTotal)}</p></div>
                </div>
                <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                  Credit Card: 3.5% convenience fee (guest pays) &nbsp;|&nbsp; ACH: 1% + $0.25 (guest pays) &nbsp;|&nbsp; Check / Utility / Deposit: no convenience fee
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="text-left px-4 py-3">Date</th>
                        <th className="text-left px-4 py-3">Property</th>
                        <th className="text-left px-4 py-3">Description</th>
                        <th className="text-right px-4 py-3">Amount</th>
                        <th className="text-left px-4 py-3">Method</th>
                        <th className="text-right px-4 py-3">Fee</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {processingFeeRows.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">{formatDate(r.date)}</td>
                          <td className="px-4 py-3">{r.property}</td>
                          <td className="px-4 py-3 font-medium">{r.description}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(r.amount)}</td>
                          <td className="px-4 py-3 text-xs uppercase text-gray-400">{r.method}</td>
                          <td className="px-4 py-3 text-right font-medium text-red-600">{formatCurrency(r.fee)}</td>
                        </tr>
                      ))}
                      {processingFeeRows.length === 0 && <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No paid payments in this month</td></tr>}
                    </tbody>
                    {processingFeeRows.length > 0 && (
                      <tfoot className="bg-gray-50 font-semibold">
                        <tr>
                          <td className="px-4 py-3" colSpan={3}>Total</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(processingFeeRows.reduce((s, x) => s + x.amount, 0))}</td>
                          <td className="px-4 py-3"></td>
                          <td className="px-4 py-3 text-right text-red-600">{formatCurrency(pfCcTotal + pfAchTotal)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>

            {/* ── Owner Payout Report ── */}
            <OwnerPayoutReport
              ownerPayouts={ownerPayouts}
              owners={owners}
              properties={properties}
              bookings={bookings}
            />

          </>
        )}
      </div>
    </DashboardLayout>
  );
}
