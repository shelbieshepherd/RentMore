import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { DashboardLayout } from "~/lib/layout";
import { useStore } from "~/lib/store";
import { formatCurrency, formatDate, getStatusColor, type PayoutMethod, type OwnerPayout } from "~/lib/data";
import { calculateOwnerPayouts } from "~/lib/payouts";

export const Route = createFileRoute("/payouts")({
  component: PayoutsPage,
});

type Period = "this-month" | "last-month" | "this-year";

function PayoutsPage() {
  const { payments, properties, owners, maintenanceRequests, ownerPayouts, addOwnerPayout } = useStore();
  const [period, setPeriod] = useState<Period>("this-month");
  const [calculatedStatements, setCalculatedStatements] = useState<any[] | null>(null);
  const [markingPaidId, setMarkingPaidId] = useState<number | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PayoutMethod>("ACH");

  const getPeriodDates = (p: Period) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const s = (d: Date) => d.toISOString().slice(0, 10);
    switch (p) {
      case "last-month": return { start: s(new Date(y, m - 1, 1)), end: s(new Date(y, m, 0)) };
      case "this-year": return { start: s(new Date(y, 0, 1)), end: s(new Date()) };
      default: return { start: s(new Date(y, m, 1)), end: s(new Date()) };
    }
  };

  const dates = getPeriodDates(period);

  const runPayouts = () => {
    const statements = calculateOwnerPayouts(owners, properties, payments, maintenanceRequests, dates.start, dates.end);
    setCalculatedStatements(statements);
    setMarkingPaidId(null);
  };

  const markPaid = (statement: any) => {
    const periodLabel = `${dates.start} to ${dates.end}`;
    addOwnerPayout({
      ownerId: statement.ownerId,
      propertyId: statement.propertyId,
      period: periodLabel,
      amount: statement.netPayout,
      status: "paid",
      datePaid: new Date().toISOString().slice(0, 10),
      method: selectedMethod,
    });
    setMarkingPaidId(null);
    // Remove the statement from calculated list
    setCalculatedStatements((prev) => prev ? prev.filter((_: any, i: number) => i !== markingPaidId) : null);
  };

  // Paid payouts stored in the system
  const storedPaidPayouts = useMemo(() => {
    return ownerPayouts
      .filter((op: OwnerPayout) => op.status === "paid")
      .sort((a: OwnerPayout, b: OwnerPayout) => (b.datePaid || "").localeCompare(a.datePaid || ""));
  }, [ownerPayouts]);

  const totalGross = calculatedStatements?.reduce((s, st) => s + st.grossRevenue, 0) ?? 0;
  const totalFees = calculatedStatements?.reduce((s, st) => s + st.managementFee, 0) ?? 0;
  const totalMaintenance = calculatedStatements?.reduce((s, st) => s + st.maintenanceDeductions, 0) ?? 0;
  const totalNet = calculatedStatements?.reduce((s, st) => s + st.netPayout, 0) ?? 0;

  const exportCSV = () => {
    if (!calculatedStatements) return;
    const rows = calculatedStatements.map((s: any) =>
      `${s.ownerName},${s.propertyName},${s.grossRevenue / 100},${s.managementFee / 100},${s.maintenanceDeductions / 100},${s.netPayout / 100},calculated,`
    ).join("\n");
    const header = "Owner,Property,Gross,Fee,Maintenance,Net,Status,Method\n";
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `rentmore-payouts-${dates.start}.csv`;
    a.click(); URL.revokeObjectURL(url);
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
    <DashboardLayout currentPath="/payouts">
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Owner Payouts</h1>
            <p className="mt-1 text-sm text-gray-500">Calculate and manage owner payouts</p>
          </div>
          <div className="flex items-center gap-3">
            {calculatedStatements && (
              <button onClick={exportCSV} className="btn-secondary gap-2 text-sm">
                📥 Export CSV
              </button>
            )}
            <button onClick={runPayouts} className="btn-accent gap-2">
              💰 Run Payouts
            </button>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-2">
          {(["this-month", "last-month", "this-year"] as const).map(p => (
            <button
              key={p}
              onClick={() => { setPeriod(p); setCalculatedStatements(null); setMarkingPaidId(null); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                period === p ? "text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
              style={period === p ? { backgroundColor: "#0f3c52" } : {}}
            >
              {p === "this-month" ? "This Month" : p === "last-month" ? "Last Month" : "This Year"}
            </button>
          ))}
        </div>

        {/* Stored paid payouts */}
        {storedPaidPayouts.length > 0 && (
          <div className="card">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Paid Payouts</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left px-6 py-3 font-medium">Owner</th>
                    <th className="text-left px-6 py-3 font-medium">Property</th>
                    <th className="text-left px-6 py-3 font-medium">Period</th>
                    <th className="text-right px-6 py-3 font-medium">Amount</th>
                    <th className="text-left px-6 py-3 font-medium">Method</th>
                    <th className="text-left px-6 py-3 font-medium">Date Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {storedPaidPayouts.map((op: OwnerPayout) => {
                    const owner = owners.find((o: any) => o.id === op.ownerId);
                    const property = properties.find((p: any) => p.id === op.propertyId);
                    return (
                      <tr key={op.id}>
                        <td className="px-6 py-3 font-medium">{owner?.name || op.ownerId}</td>
                        <td className="px-6 py-3">{property?.name || op.propertyId}</td>
                        <td className="px-6 py-3 text-gray-500">{op.period}</td>
                        <td className="px-6 py-3 text-right font-medium text-green-600">{formatCurrency(op.amount)}</td>
                        <td className="px-6 py-3">{methodBadge(op.method)}</td>
                        <td className="px-6 py-3 text-gray-500">{op.datePaid ? formatDate(op.datePaid) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {calculatedStatements ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
              <div className="stat-card">
                <p className="text-sm text-gray-500">Gross Revenue</p>
                <p className="text-3xl font-bold mt-1 text-green-600">{formatCurrency(totalGross)}</p>
                <p className="text-xs text-gray-400 mt-1">{calculatedStatements.length} properties</p>
              </div>
              <div className="stat-card">
                <p className="text-sm text-gray-500">Mgmt Fees</p>
                <p className="text-3xl font-bold mt-1 text-red-500">{formatCurrency(totalFees)}</p>
                <p className="text-xs text-gray-400 mt-1">15% of gross</p>
              </div>
              <div className="stat-card">
                <p className="text-sm text-gray-500">Maint. Deductions</p>
                <p className="text-3xl font-bold mt-1 text-orange-500">{formatCurrency(totalMaintenance)}</p>
                <p className="text-xs text-gray-400 mt-1">{calculatedStatements.filter((s: any) => s.maintenanceDeductions > 0).length} properties</p>
              </div>
              <div className="stat-card">
                <p className="text-sm text-gray-500">Net Payout</p>
                <p className="text-3xl font-bold mt-1" style={{ color: "#0f3c52" }}>{formatCurrency(totalNet)}</p>
                <p className="text-xs text-gray-400 mt-1">{period} period</p>
              </div>
            </div>

            {/* Per-Owner Statements */}
            {calculatedStatements.map((statement: any, idx: number) => (
              <div key={idx} className="card">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">{statement.ownerName}</h2>
                    <p className="text-sm text-gray-500">{statement.propertyName} · {statement.period}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="badge bg-blue-100 text-blue-800">{statement.status}</span>
                    {markingPaidId === idx ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedMethod}
                          onChange={(e) => setSelectedMethod(e.target.value as PayoutMethod)}
                          className="text-xs border border-gray-200 rounded px-2 py-1"
                        >
                          <option value="ACH">ACH</option>
                          <option value="check">Check</option>
                        </select>
                        <button
                          onClick={() => markPaid(statement)}
                          className="text-xs px-3 py-1 rounded text-white font-medium"
                          style={{ backgroundColor: "#0f3c52" }}
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setMarkingPaidId(null)}
                          className="text-xs px-3 py-1 rounded border border-gray-200 text-gray-500"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setMarkingPaidId(idx)}
                        className="text-xs px-3 py-1 rounded border font-medium text-green-700 border-green-300 bg-green-50 hover:bg-green-100"
                      >
                        ✅ Mark Paid
                      </button>
                    )}
                  </div>
                </div>

                {/* Payout Breakdown */}
                <div className="p-6 grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500">Gross Revenue</p>
                    <p className="text-lg font-bold text-green-600">{formatCurrency(statement.grossRevenue)}</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500">Mgmt Fee ({statement.managementFeePercent}%)</p>
                    <p className="text-lg font-bold text-red-500">{formatCurrency(statement.managementFee)}</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500">Maint. Deductions</p>
                    <p className="text-lg font-bold text-orange-500">{formatCurrency(statement.maintenanceDeductions)}</p>
                  </div>
                  <div className="text-center p-3 rounded-lg" style={{ backgroundColor: "#0f3c52" }}>
                    <p className="text-xs text-blue-200">Net Payout</p>
                    <p className="text-lg font-bold text-white">{formatCurrency(statement.netPayout)}</p>
                  </div>
                </div>

                {/* Line Items */}
                {statement.lineItems.length > 0 && (
                  <div className="border-t border-gray-100">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500">
                          <tr>
                            <th className="text-left px-6 py-2 font-medium">Date</th>
                            <th className="text-left px-6 py-2 font-medium">Description</th>
                            <th className="text-left px-6 py-2 font-medium">Type</th>
                            <th className="text-right px-6 py-2 font-medium">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {statement.lineItems.map((item: any, i: number) => (
                            <tr key={i}>
                              <td className="px-6 py-2 text-gray-500">{formatDate(item.date)}</td>
                              <td className="px-6 py-2">{item.description}</td>
                              <td className="px-6 py-2">
                                <span className={`badge ${
                                  item.type === "rent" ? "bg-blue-100 text-blue-800" :
                                  item.type === "booking" ? "bg-green-100 text-green-800" :
                                  item.type === "maintenance_deduction" ? "bg-red-100 text-red-800" :
                                  "bg-gray-100 text-gray-600"
                                }`}>{item.type.replace("_", " ")}</span>
                              </td>
                              <td className={`px-6 py-2 text-right font-medium ${item.amount < 0 ? "text-red-600" : "text-green-600"}`}>
                                {item.amount < 0 ? "" : "+"}{formatCurrency(item.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </>
        ) : (
          <div className="text-center py-20">
            <div className="text-4xl mb-3">💰</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Ready to calculate payouts</h2>
            <p className="text-gray-500 mb-4">
              Select a period and click "Run Payouts" to calculate what's owed to each owner.<br />
              The engine calculates gross rent, deducts management fees (15%), and subtracts maintenance chargebacks.
            </p>
            <button onClick={runPayouts} className="btn-accent">
              💰 Run Payouts for {period === "this-month" ? "This Month" : period === "last-month" ? "Last Month" : "This Year"}
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
