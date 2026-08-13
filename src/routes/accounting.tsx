import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { DashboardLayout } from "~/lib/layout";
import { useStore } from "~/lib/store";
import { formatCurrency, formatDate, getStatusColor } from "~/lib/data";

export const Route = createFileRoute("/accounting")({
  component: AccountingPage,
});

type DateRange = "this-month" | "last-month" | "last-3" | "last-6" | "this-year" | "custom";

function getRangeDates(range: DateRange, customStart?: string, customEnd?: string): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const toStr = (d: Date) => d.toISOString().slice(0, 10);

  switch (range) {
    case "last-month": return { start: toStr(new Date(y, m - 1, 1)), end: toStr(new Date(y, m, 0)) };
    case "last-3": return { start: toStr(new Date(y, m - 2, 1)), end: toStr(new Date()) };
    case "last-6": return { start: toStr(new Date(y, m - 5, 1)), end: toStr(new Date()) };
    case "this-year": return { start: toStr(new Date(y, 0, 1)), end: toStr(new Date()) };
    case "this-month": default: return { start: toStr(new Date(y, m, 1)), end: toStr(new Date()) };
  }
}

function AccountingPage() {
  const { payments, properties } = useStore();
  const [range, setRange] = useState<DateRange>("this-month");

  const rangeDates = getRangeDates(range);

  // Filter payments within date range
  const filtered = useMemo(() => {
    return payments.filter(p => {
      const d = p.date || p.dueDate;
      return d >= rangeDates.start && d <= rangeDates.end;
    });
  }, [payments, rangeDates]);

  // Transaction breakdown
  const paidTrans = filtered.filter(p => p.status === "paid");
  const pendingTrans = filtered.filter(p => p.status === "pending");
  const overdueTrans = filtered.filter(p => p.status === "overdue");

  const gross = paidTrans.reduce((s, p) => s + p.amount, 0);
  const ccTotal = paidTrans.filter(p => p.method === "credit card").reduce((s, p) => s + p.amount, 0);
  const achTotal = paidTrans.filter(p => p.method === "ACH").reduce((s, p) => s + p.amount, 0);
  const fees = paidTrans.reduce((sum, p) => sum + (p.method === "credit card" ? p.amount * 0.035 : p.method === "ACH" ? p.amount * 0.01 + 0.25 : 0), 0);
  const net = gross; // PM receives 100% — convenience fees are guest-paid
  const pendingTotal = pendingTrans.reduce((s, p) => s + p.amount, 0);
  const overdueTotal = overdueTrans.reduce((s, p) => s + p.amount, 0);

  // CSV export
  const exportCSV = () => {
    const headers = "Date,Property,Description,Method,Amount,Status,Fee\n";
    const rows = filtered.map(p => {
      const prop = properties.find(pr => pr.id === p.propertyId);
      const fee = p.method === "credit card" ? Math.round(p.amount * 0.029 + 30) : Math.round(p.amount * 0.01 + 25);
      return `${p.date || p.dueDate},${prop?.name || ""},"${p.description}",${p.method},${(p.amount / 100).toFixed(2)},${p.status},${(fee / 100).toFixed(2)}`;
    }).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `rentmore-ledger-${rangeDates.start}-to-${rangeDates.end}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout currentPath="/accounting">
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Accounting Ledger</h1>
            <p className="mt-1 text-sm text-gray-500">Transaction history for QuickBooks reconciliation</p>
          </div>
          <button onClick={exportCSV} className="btn-primary gap-2">
            <span>📥</span> Export CSV
          </button>
        </div>

        {/* Date Range Selector */}
        <div className="flex items-center gap-2">
          {(["this-month", "last-month", "last-3", "last-6", "this-year"] as const).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                range === r ? "text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
              style={range === r ? { backgroundColor: "#0f3c52" } : {}}
            >
              {r === "this-month" ? "This Month" : r === "last-month" ? "Last Month" : r === "last-3" ? "Last 3 Months" : r === "last-6" ? "Last 6 Months" : "This Year"}
            </button>
          ))}
        </div>
        <p className="text-sm text-gray-400 -mt-6">
          {formatDate(rangeDates.start)} — {formatDate(rangeDates.end)}
        </p>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
          <div className="stat-card">
            <p className="text-sm text-gray-500">Gross Revenue</p>
            <p className="text-3xl font-bold mt-1 text-green-600">{formatCurrency(gross)}</p>
            <p className="text-xs text-gray-400 mt-1">{paidTrans.length} transactions</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-gray-500">Guest-Paid Convenience Fees (kept by you)</p>
            <p className="text-3xl font-bold mt-1 text-green-600">{formatCurrency(fees)}</p>
            <p className="text-xs text-gray-400 mt-1">Guests pay: 3.5% card · 1% + $0.25 ACH — yours after Stripe's cost</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-gray-500">Net Revenue (to you)</p>
            <p className="text-3xl font-bold mt-1" style={{ color: "#0f3c52" }}>{formatCurrency(net)}</p>
            <p className="text-xs text-gray-400 mt-1">You keep 100% of every payment + convenience-fee leftover</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-gray-500">Outstanding</p>
            <p className="text-3xl font-bold mt-1 text-yellow-600">{formatCurrency(pendingTotal + overdueTotal)}</p>
            <p className="text-xs text-gray-400 mt-1">{pendingTrans.length} pending · {overdueTrans.length} overdue</p>
          </div>
        </div>

        {/* Payment Method Breakdown */}
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold">Payment Method Breakdown</h2>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold">{formatCurrency(ccTotal)}</p>
              <p className="text-sm text-gray-500">Credit Card</p>
              <p className="text-xs text-gray-400">3.5% guest convenience fee</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold">{formatCurrency(achTotal)}</p>
              <p className="text-sm text-gray-500">ACH Transfer</p>
              <p className="text-xs text-gray-400">1% + $0.25 guest convenience fee</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold">{formatCurrency(gross - ccTotal - achTotal)}</p>
              <p className="text-sm text-gray-500">Cash / Other</p>
              <p className="text-xs text-gray-400">No convenience fee</p>
            </div>
          </div>
        </div>

        {/* Transaction Ledger */}
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold">Transaction Ledger</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">Date</th>
                  <th className="text-left px-6 py-3 font-medium">Property</th>
                  <th className="text-left px-6 py-3 font-medium">Description</th>
                  <th className="text-left px-6 py-3 font-medium">Method</th>
                  <th className="text-right px-6 py-3 font-medium">Gross</th>
                  <th className="text-right px-6 py-3 font-medium">Fee</th>
                  <th className="text-right px-6 py-3 font-medium">Net</th>
                  <th className="text-left px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(p => {
                  const prop = properties.find(pr => pr.id === p.propertyId);
                  const fee = p.method === "credit card" ? Math.round(p.amount * 0.029 + 30) : p.method === "ACH" ? Math.round(p.amount * 0.01 + 25) : 0;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-500">{formatDate(p.date || p.dueDate)}</td>
                      <td className="px-6 py-3 font-medium">{prop?.name ?? "—"}</td>
                      <td className="px-6 py-3">{p.description}</td>
                      <td className="px-6 py-3 capitalize text-gray-500">{p.method}</td>
                      <td className="px-6 py-3 text-right font-medium">{formatCurrency(p.amount)}</td>
                      <td className="px-6 py-3 text-right text-red-500">{formatCurrency(fee)}</td>
                      <td className="px-6 py-3 text-right font-semibold">{formatCurrency(p.amount - fee)}</td>
                      <td className="px-6 py-3">
                        <span className={`badge ${getStatusColor(p.status)}`}>{p.status}</span>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400">No transactions in this date range</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}