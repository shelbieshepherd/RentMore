import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { DashboardLayout } from "~/lib/layout";
import { useStore } from "~/lib/store";
import { formatCurrency, formatDate, type PayoutMethod } from "~/lib/data";
import { calculateOwnerPayouts, type OwnerPayoutStatement } from "~/lib/payouts";

export const Route = createFileRoute("/payouts")({
  component: PayoutsPage,
});

type Period = "this-month" | "last-month" | "this-year";

function methodLabel(m?: string): string {
  if (!m) return "ACH";
  const v = m.toLowerCase();
  return v === "check" ? "check" : v === "ach" ? "ACH" : m;
}

function PayoutsPage() {
  const { payments, properties, owners, maintenanceRequests, companyId, recordPayout } = useStore();
  const [period, setPeriod] = useState<Period>("this-month");
  const [calculatedStatements, setCalculatedStatements] = useState<OwnerPayoutStatement[] | null>(null);
  const [markingPaidId, setMarkingPaidId] = useState<number | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<Record<number, PayoutMethod>>({});
  const [exportingAch, setExportingAch] = useState(false);
  const [checkStub, setCheckStub] = useState<{ statement: OwnerPayoutStatement; method: PayoutMethod } | null>(null);
  const [payoutError, setPayoutError] = useState<string | null>(null);

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

  const ownerMethod = (ownerId: string): PayoutMethod => {
    const o = owners.find((x: any) => x.id === ownerId);
    return o?.payoutMethod || "ACH";
  };

  const runPayouts = () => {
    const statements = calculateOwnerPayouts(owners, properties, payments, maintenanceRequests, dates.start, dates.end);
    setCalculatedStatements(statements.map(s => ({ ...s, status: "calculated" })));
    setMarkingPaidId(null);
    setPayoutError(null);
  };

  const markPending = (idx: number) => {
    setCalculatedStatements(prev => prev ? prev.map((s, i) => i === idx ? { ...s, status: "pending" as const } : s) : null);
    setMarkingPaidId(null);
  };

  const markPaid = async (idx: number, statement: OwnerPayoutStatement) => {
    const method = selectedMethod[idx] || ownerMethod(statement.ownerId);
    setPayoutError(null);
    const res = await recordPayout({
      ownerId: statement.ownerId,
      propertyId: statement.propertyId,
      amountCents: Math.round(statement.netPayout * 100),
      method,
      period: statement.period,
    });
    if (!res) { setPayoutError("Could not record payout — please try again."); return; }
    setMarkingPaidId(null);
    // Remove the statement from the calculated list (it now shows under Paid Payouts).
    setCalculatedStatements(prev => prev ? prev.filter((_, i) => i !== idx) : null);
  };

  // Paid payouts = payments rows with payment_type 'payout' (DB-backed; reconciles with reporting).
  const paidPayouts = useMemo(() => {
    return payments
      .filter((p: any) => p.paymentType === "payout")
      .sort((a: any, b: any) => (b.date || "").localeCompare(a.date || ""));
  }, [payments]);

  const totalGross = calculatedStatements?.reduce((s, st) => s + st.grossRevenue, 0) ?? 0;
  const totalFees = calculatedStatements?.reduce((s, st) => s + st.managementFee, 0) ?? 0;
  const totalMaintenance = calculatedStatements?.reduce((s, st) => s + st.maintenanceDeductions, 0) ?? 0;
  const totalNet = calculatedStatements?.reduce((s, st) => s + st.netPayout, 0) ?? 0;

  const exportCSV = () => {
    if (!calculatedStatements) return;
    const rows = calculatedStatements.map((s) =>
      `${s.ownerName},${s.propertyName},${(s.grossRevenue / 100).toFixed(2)},${(s.managementFee / 100).toFixed(2)},${(s.maintenanceDeductions / 100).toFixed(2)},${(s.netPayout / 100).toFixed(2)},${s.status}`
    ).join("\n");
    const header = "Owner,Property,Gross,Fee,Maintenance,Net,Status\n";
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `rentmore-payouts-${dates.start}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // ACH list export: CSV the PM uploads to their own bank's bill-pay screen.
  // RentMore never transmits it. Server fn computes from DB (ACH owners only).
  const exportAchList = async () => {
    setExportingAch(true);
    setPayoutError(null);
    try {
      const { generateAchListExport } = await import("~/lib/db-queries");
      const csv = await generateAchListExport({ data: { companyId } });
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `rentmore-ach-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e) {
      setPayoutError(e instanceof Error ? e.message : "Could not generate the ACH export.");
    } finally {
      setExportingAch(false);
    }
  };

  const methodBadge = (m?: string) => {
    const label = methodLabel(m);
    return (
      <span className={`badge text-xs ${label === "check" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
        {label === "check" ? "Check" : "ACH"}
      </span>
    );
  };

  const statusBadge = (status: string) => {
    const cls = status === "paid" ? "bg-green-100 text-green-800" : status === "pending" ? "bg-yellow-100 text-yellow-800" : "bg-blue-100 text-blue-800";
    return <span className={`badge ${cls}`}>{status}</span>;
  };

  return (
    <DashboardLayout currentPath="/payouts">
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Owner Payouts</h1>
            <p className="mt-1 text-sm text-gray-500">Calculate statements, export ACH lists, and record disbursements</p>
          </div>
          <div className="flex items-center gap-3">
            {calculatedStatements && (
              <button onClick={exportCSV} className="btn-secondary gap-2 text-sm">
                📥 Export CSV
              </button>
            )}
            <button
              onClick={exportAchList}
              disabled={exportingAch}
              className="btn-secondary gap-2 text-sm disabled:opacity-50"
              title="Generates a CSV of ACH payouts to upload to your bank's bill-pay screen"
            >
              {exportingAch ? "⏳ Generating…" : "🏦 Export ACH list"}
            </button>
            <button onClick={runPayouts} className="btn-accent gap-2">
              💰 Run Payouts
            </button>
          </div>
        </div>

        {payoutError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {payoutError}
          </div>
        )}

        {/* Hybrid model explanation */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 text-sm text-blue-900">
          <p className="font-medium mb-1">💡 How payouts work in RentMore (hybrid model)</p>
          <p className="text-blue-700">
            RentMore calculates each owner's statement and generates the paperwork — the <strong>ACH export file</strong> (upload it to
            your bank's bill-pay screen) or a printable <strong>check stub</strong>. You move the money from your own bank, then click
            <strong> Record payout</strong> to mark it paid. RentMore never transmits payments or holds owner funds.
          </p>
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

        {/* Paid payouts (DB-backed payout rows) */}
        {paidPayouts.length > 0 && (
          <div className="card">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Paid Payouts</h2>
              <p className="text-xs text-gray-400 mt-0.5">Recorded as payment_type 'payout' — reconciles with reporting</p>
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
                  {paidPayouts.map((op: any) => {
                    const owner = owners.find((o: any) => o.id === op.ownerId);
                    const property = properties.find((p: any) => p.id === op.propertyId);
                    const periodLabel = op.description?.includes("—")
                      ? op.description.split("—")[1]?.trim() || op.description
                      : op.description;
                    return (
                      <tr key={op.id}>
                        <td className="px-6 py-3 font-medium">{owner?.name || op.ownerId}</td>
                        <td className="px-6 py-3">{property?.name || op.propertyId}</td>
                        <td className="px-6 py-3 text-gray-500">{periodLabel}</td>
                        <td className="px-6 py-3 text-right font-medium text-green-600">{formatCurrency(op.amount)}</td>
                        <td className="px-6 py-3">{methodBadge(op.method)}</td>
                        <td className="px-6 py-3 text-gray-500">{op.date ? formatDate(op.date) : "—"}</td>
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
                <p className="text-xs text-gray-400 mt-1">{calculatedStatements.filter(s => s.maintenanceDeductions > 0).length} properties</p>
              </div>
              <div className="stat-card">
                <p className="text-sm text-gray-500">Net Payout</p>
                <p className="text-3xl font-bold mt-1" style={{ color: "#0f3c52" }}>{formatCurrency(totalNet)}</p>
                <p className="text-xs text-gray-400 mt-1">{period} period</p>
              </div>
            </div>

            {/* Per-Owner Statements */}
            {calculatedStatements.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-3xl mb-3">🎉</p>
                <p>All statements for this period have been recorded as paid.</p>
              </div>
            ) : calculatedStatements.map((statement, idx) => {
              const method = selectedMethod[idx] || ownerMethod(statement.ownerId);
              const owner = owners.find((o: any) => o.id === statement.ownerId);
              return (
                <div key={`${statement.ownerId}-${statement.propertyId}-${idx}`} className="card">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">{statement.ownerName}</h2>
                      <p className="text-sm text-gray-500">{statement.propertyName} · {statement.period}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {statusBadge(statement.status)}
                      {statement.status === "pending" && (
                        <button
                          onClick={() => markPaid(idx, statement)}
                          className="text-xs px-3 py-1 rounded text-white font-medium"
                          style={{ backgroundColor: "#0f3c52" }}
                        >
                          💸 Record payout
                        </button>
                      )}
                      {statement.status === "calculated" && (
                        <>
                          {methodLabel(method) === "check" ? (
                            <button
                              onClick={() => setCheckStub({ statement, method })}
                              className="text-xs px-3 py-1 rounded border font-medium text-amber-700 border-amber-300 bg-amber-50 hover:bg-amber-100"
                            >
                              🖨 Check stub
                            </button>
                          ) : (
                            <span className="text-[10px] text-gray-400">ACH — included in export file</span>
                          )}
                          <button
                            onClick={() => markPending(idx)}
                            className="text-xs px-3 py-1 rounded border font-medium text-blue-700 border-blue-300 bg-blue-50 hover:bg-blue-100"
                          >
                            ⏸ Mark Pending
                          </button>
                          {markingPaidId === idx ? (
                            <div className="flex items-center gap-2">
                              <select
                                value={method}
                                onChange={(e) => setSelectedMethod(prev => ({ ...prev, [idx]: e.target.value as PayoutMethod }))}
                                className="text-xs border border-gray-200 rounded px-2 py-1"
                              >
                                <option value="ACH">ACH</option>
                                <option value="check">Check</option>
                              </select>
                              <button
                                onClick={() => markPaid(idx, statement)}
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
                        </>
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
                            {statement.lineItems.map((item, i) => (
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

                  {/* ACH payout hint for this owner */}
                  {methodLabel(method) === "ACH" && (owner?.achInfo?.accountNumber || owner?.achInfo?.bankName) && (
                    <div className="border-t border-gray-100 px-6 py-3 text-xs text-gray-400">
                      💳 ACH payout to {owner?.achInfo?.bankName || "owner's bank"} ••••{String(owner?.achInfo?.accountNumber || "").slice(-4)} — included in the ACH export file above.
                    </div>
                  )}
                  {methodLabel(method) === "ACH" && !owner?.achInfo?.accountNumber && (
                    <div className="border-t border-gray-100 px-6 py-3 text-xs text-amber-600">
                      ⚠️ {statement.ownerName} is set to ACH but has no bank details on file — add them in the Owners tab so the ACH export includes this payout.
                    </div>
                  )}
                </div>
              );
            })}
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

      {/* Check stub modal (printable) */}
      {checkStub && (() => {
        const { statement, method } = checkStub;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/30" onClick={() => setCheckStub(null)} />
            <div className="relative z-10 bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-md mx-4">
              <div id="check-stub" className="p-6">
                <div className="text-center border-b border-dashed border-gray-300 pb-4 mb-4">
                  <p className="text-lg font-bold text-gray-900">RentMore Owner Payout</p>
                  <p className="text-xs text-gray-400">Check stub — print and cut the check from your own bank account</p>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Payable to</span>
                    <span className="font-semibold">{statement.ownerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Property</span>
                    <span>{statement.propertyName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Period</span>
                    <span>{statement.period}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Gross revenue</span>
                    <span>{formatCurrency(statement.grossRevenue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Mgmt fee ({statement.managementFeePercent}%)</span>
                    <span className="text-red-600">−{formatCurrency(statement.managementFee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Maintenance deductions</span>
                    <span className="text-red-600">−{formatCurrency(statement.maintenanceDeductions)}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-200 pt-3 text-base">
                    <span className="font-semibold">Amount (pay {method === "check" ? "by check" : "via ACH"})</span>
                    <span className="font-bold" style={{ color: "#0f3c52" }}>{formatCurrency(statement.netPayout)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Memo</span>
                    <span>Owner payout — {statement.period}</span>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-100 flex gap-3 print:hidden">
                <button onClick={() => window.print()} className="btn-accent flex-1">🖨 Print stub</button>
                <button onClick={() => setCheckStub(null)} className="btn-secondary flex-1">Close</button>
              </div>
            </div>
          </div>
        );
      })()}
    </DashboardLayout>
  );
}
