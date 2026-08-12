import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "~/lib/layout";
import { useStore } from "~/lib/store";
import { formatCurrency, formatDate } from "~/lib/data";
import { calculateOwnerPayouts } from "~/lib/payouts";

export const Route = createFileRoute("/payouts")({
  component: PayoutsPage,
});

type Period = "this-month" | "last-month" | "this-year";

interface PayoutRow {
  id: string;
  owner_id: string;
  owner_name: string | null;
  property_id: string | null;
  period_start: string;
  period_end: string;
  gross_cents: number;
  management_fee_cents: number;
  maintenance_deductions_cents: number;
  net_cents: number;
  status: "calculated" | "pending" | "paid";
  method: "ach" | "check";
  paid_at: string | null;
  created_at: string;
}

function methodLabel(m: string): string {
  return m === "check" ? "Check" : "ACH";
}

function PayoutsPage() {
  const { payments, properties, owners, maintenanceRequests, companyId, pushPaidPayout } = useStore();
  const [period, setPeriod] = useState<Period>("this-month");
  const [batch, setBatch] = useState<PayoutRow[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [exportingAch, setExportingAch] = useState(false);
  const [checkStub, setCheckStub] = useState<PayoutRow | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const loadBatch = async () => {
    try {
      const { fetchPayouts } = await import("~/lib/db-queries");
      const rows = await fetchPayouts({ data: { companyId } });
      const periodRows = (rows as PayoutRow[]).filter(
        r => r.period_start === dates.start && r.period_end === dates.end
      );
      setBatch(periodRows);
    } catch {
      setBatch(null); // demo/local fallback: no persisted batch
    }
  };

  // Load the persisted batch for the selected period on mount/period/company change.
  useEffect(() => { void loadBatch(); /* eslint-disable-next-line */ }, [period, companyId]);

  const runPayouts = async () => {
    setGenerating(true); setError(null);
    try {
      const { generatePayoutStatements } = await import("~/lib/db-queries");
      await generatePayoutStatements({ data: { companyId, periodStart: dates.start, periodEnd: dates.end } });
      await loadBatch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate payout statements.");
    } finally {
      setGenerating(false);
    }
  };

  const markPending = async (row: PayoutRow) => {
    setError(null);
    try {
      const { updatePayoutStatusDB } = await import("~/lib/db-queries");
      await updatePayoutStatusDB({ data: { companyId, payoutId: row.id, status: "pending" } });
      await loadBatch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not mark pending.");
    }
  };

  const recordPaid = async (row: PayoutRow) => {
    setRecordingId(row.id); setError(null);
    try {
      const { recordPayoutPaid } = await import("~/lib/db-queries");
      const res = (await recordPayoutPaid({ data: { companyId, payoutId: row.id } })) as
        | { alreadyPaid: true }
        | {
            payoutId: string; paymentId: string; createdAt: string;
            ownerId: string; propertyId: string; amountCents: number;
            method: "ach" | "check"; periodStart: string; periodEnd: string;
          };
      if (!("alreadyPaid" in res)) {
        pushPaidPayout({
          id: res.paymentId,
          ownerId: res.ownerId,
          propertyId: res.propertyId,
          amountCents: res.amountCents,
          method: res.method,
          periodStart: res.periodStart,
          periodEnd: res.periodEnd,
          datePaid: String(res.createdAt || new Date().toISOString()).slice(0, 10),
        });
      }
      await loadBatch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record the payout.");
    } finally {
      setRecordingId(null);
    }
  };

  // Paid payouts = payments rows with payment_type 'payout' (DB-backed; reconciles with reporting).
  const paidPayouts = useMemo(() => {
    return payments
      .filter((p: any) => p.paymentType === "payout")
      .sort((a: any, b: any) => (b.date || "").localeCompare(a.date || ""));
  }, [payments]);

  const totalGross = batch?.reduce((s, r) => s + Number(r.gross_cents), 0) ?? 0;
  const totalFees = batch?.reduce((s, r) => s + Number(r.management_fee_cents), 0) ?? 0;
  const totalMaintenance = batch?.reduce((s, r) => s + Number(r.maintenance_deductions_cents), 0) ?? 0;
  const totalNet = batch?.reduce((s, r) => s + Number(r.net_cents), 0) ?? 0;

  // Per-owner/property detail line items (display only — recomputed from store data).
  const detailFor = (row: PayoutRow) => {
    const statements = calculateOwnerPayouts(owners, properties, payments, maintenanceRequests, row.period_start, row.period_end);
    return statements.find(s => s.ownerId === row.owner_id && s.propertyId === row.property_id);
  };

  const exportCSV = () => {
    if (!batch) return;
    const rows = batch.map(r =>
      `${r.owner_name || r.owner_id},${properties.find(p => p.id === r.property_id)?.name || ""},${(Number(r.gross_cents) / 100).toFixed(2)},${(Number(r.management_fee_cents) / 100).toFixed(2)},${(Number(r.maintenance_deductions_cents) / 100).toFixed(2)},${(Number(r.net_cents) / 100).toFixed(2)},${r.status}`
    ).join("\n");
    const blob = new Blob([`Owner,Property,Gross,Fee,Maintenance,Net,Status\n${rows}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `rentmore-payouts-${dates.start}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // ACH list export: CSV the PM uploads to their own bank's bill-pay screen.
  // RentMore never transmits it. Reads the persisted batch (calculated + pending ACH rows).
  const exportAchList = async () => {
    setExportingAch(true); setError(null);
    try {
      const { generateAchListExport } = await import("~/lib/db-queries");
      const csv = await generateAchListExport({ data: { companyId } });
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `rentmore-ach-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate the ACH export.");
    } finally {
      setExportingAch(false);
    }
  };

  const methodBadge = (m: string) => (
    <span className={`badge text-xs ${m === "check" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
      {methodLabel(m)}
    </span>
  );

  const statusBadge = (status: string) => {
    const cls = status === "paid" ? "bg-green-100 text-green-800" : status === "pending" ? "bg-yellow-100 text-yellow-800" : "bg-blue-100 text-blue-800";
    return <span className={`badge ${cls}`}>{status}</span>;
  };

  const achRows = batch?.filter(r => r.status !== "paid" && r.method === "ach" && Number(r.net_cents) > 0) ?? [];
  const propertyName = (id: string | null) => id ? properties.find(p => p.id === id)?.name || id : "—";

  return (
    <DashboardLayout currentPath="/payouts">
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Owner Payouts</h1>
            <p className="mt-1 text-sm text-gray-500">Generate statements, export ACH lists, and record disbursements</p>
          </div>
          <div className="flex items-center gap-3">
            {batch && batch.length > 0 && (
              <button onClick={exportCSV} className="btn-secondary gap-2 text-sm">📥 Export CSV</button>
            )}
            {achRows.length > 0 && (
              <button
                onClick={exportAchList}
                disabled={exportingAch}
                className="btn-secondary gap-2 text-sm disabled:opacity-50"
                title="CSV of ACH payouts to upload to your bank's bill-pay screen"
              >
                {exportingAch ? "⏳ Generating…" : "🏦 Export ACH list"}
              </button>
            )}
            <button onClick={runPayouts} disabled={generating} className="btn-accent gap-2 disabled:opacity-50">
              {generating ? "⏳ Generating…" : "💰 Run Payouts"}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
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
              onClick={() => { setPeriod(p); setBatch(null); }}
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
                        <td className="px-6 py-3">{methodBadge(op.method === "check" ? "check" : "ach")}</td>
                        <td className="px-6 py-3 text-gray-500">{op.date ? formatDate(op.date) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {batch === null ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-3">💰</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Ready to calculate payouts</h2>
            <p className="text-gray-500 mb-4">
              Select a period and click "Run Payouts" to calculate what's owed to each owner.<br />
              The engine calculates gross rent, deducts management fees (15%), and subtracts maintenance chargebacks.
            </p>
            <button onClick={runPayouts} disabled={generating} className="btn-accent disabled:opacity-50">
              💰 Run Payouts for {period === "this-month" ? "This Month" : period === "last-month" ? "Last Month" : "This Year"}
            </button>
          </div>
        ) : batch.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-3xl mb-3">📭</p>
            <p className="text-gray-500">No statements for this period yet. Run payouts to generate them.</p>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
              <div className="stat-card">
                <p className="text-sm text-gray-500">Gross Revenue</p>
                <p className="text-3xl font-bold mt-1 text-green-600">{formatCurrency(totalGross / 100)}</p>
                <p className="text-xs text-gray-400 mt-1">{batch.length} statements</p>
              </div>
              <div className="stat-card">
                <p className="text-sm text-gray-500">Mgmt Fees</p>
                <p className="text-3xl font-bold mt-1 text-red-500">{formatCurrency(totalFees / 100)}</p>
                <p className="text-xs text-gray-400 mt-1">15% of gross</p>
              </div>
              <div className="stat-card">
                <p className="text-sm text-gray-500">Maint. Deductions</p>
                <p className="text-3xl font-bold mt-1 text-orange-500">{formatCurrency(totalMaintenance / 100)}</p>
                <p className="text-xs text-gray-400 mt-1">{batch.filter(r => Number(r.maintenance_deductions_cents) > 0).length} statements</p>
              </div>
              <div className="stat-card">
                <p className="text-sm text-gray-500">Net Payout</p>
                <p className="text-3xl font-bold mt-1" style={{ color: "#0f3c52" }}>{formatCurrency(totalNet / 100)}</p>
                <p className="text-xs text-gray-400 mt-1">{period} period</p>
              </div>
            </div>

            {/* Per-Owner Statements */}
            {batch.map((row) => {
              const detail = detailFor(row);
              const owner = owners.find((o: any) => o.id === row.owner_id);
              return (
                <div key={row.id} className="card">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">{row.owner_name || row.owner_id}</h2>
                      <p className="text-sm text-gray-500">{propertyName(row.property_id)} · {row.period_start} to {row.period_end}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {statusBadge(row.status)}
                      {methodBadge(row.method)}
                      {row.status === "calculated" && (
                        <>
                          {row.method === "check" ? (
                            <button
                              onClick={() => setCheckStub(row)}
                              className="text-xs px-3 py-1 rounded border font-medium text-amber-700 border-amber-300 bg-amber-50 hover:bg-amber-100"
                            >
                              🖨 Check stub
                            </button>
                          ) : (
                            <span className="text-[10px] text-gray-400">ACH — included in export file</span>
                          )}
                          <button
                            onClick={() => markPending(row)}
                            className="text-xs px-3 py-1 rounded border font-medium text-blue-700 border-blue-300 bg-blue-50 hover:bg-blue-100"
                          >
                            ⏸ Mark Pending
                          </button>
                        </>
                      )}
                      {row.status === "pending" && (
                        <button
                          onClick={() => recordPaid(row)}
                          disabled={recordingId === row.id}
                          className="text-xs px-3 py-1 rounded text-white font-medium disabled:opacity-50"
                          style={{ backgroundColor: "#0f3c52" }}
                        >
                          {recordingId === row.id ? "⏳…" : "💸 Record payout / Mark paid"}
                        </button>
                      )}
                      {row.status === "pending" && row.method === "check" && (
                        <button
                          onClick={() => setCheckStub(row)}
                          className="text-xs px-3 py-1 rounded border font-medium text-amber-700 border-amber-300 bg-amber-50 hover:bg-amber-100"
                        >
                          🖨 Check stub
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Payout Breakdown */}
                  <div className="p-6 grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">Gross Revenue</p>
                      <p className="text-lg font-bold text-green-600">{formatCurrency(Number(row.gross_cents) / 100)}</p>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">Mgmt Fee</p>
                      <p className="text-lg font-bold text-red-500">{formatCurrency(Number(row.management_fee_cents) / 100)}</p>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">Maint. Deductions</p>
                      <p className="text-lg font-bold text-orange-500">{formatCurrency(Number(row.maintenance_deductions_cents) / 100)}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg" style={{ backgroundColor: "#0f3c52" }}>
                      <p className="text-xs text-blue-200">Net Payout</p>
                      <p className="text-lg font-bold text-white">{formatCurrency(Number(row.net_cents) / 100)}</p>
                    </div>
                  </div>

                  {/* Line Items (detail, display only) */}
                  {detail && detail.lineItems.length > 0 && (
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
                            {detail.lineItems.map((item, i) => (
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
                  {row.method === "ach" && (owner?.achInfo?.accountNumber || owner?.achInfo?.bankName) && (
                    <div className="border-t border-gray-100 px-6 py-3 text-xs text-gray-400">
                      💳 ACH payout to {owner?.achInfo?.bankName || "owner's bank"} ••••{String(owner?.achInfo?.accountNumber || "").slice(-4)} — included in the ACH export file above.
                    </div>
                  )}
                  {row.method === "ach" && !owner?.achInfo?.accountNumber && (
                    <div className="border-t border-gray-100 px-6 py-3 text-xs text-amber-600">
                      ⚠️ {row.owner_name || "This owner"} is set to ACH but has no bank details on file — add them in the Owners tab so the ACH export includes this payout.
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Check stub modal (printable) */}
      {checkStub && (() => {
        const row = checkStub;
        const net = Number(row.net_cents) / 100;
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
                    <span className="font-semibold">{row.owner_name || row.owner_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Property</span>
                    <span>{propertyName(row.property_id)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Period</span>
                    <span>{row.period_start} to {row.period_end}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Gross revenue</span>
                    <span>{formatCurrency(Number(row.gross_cents) / 100)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Mgmt fee</span>
                    <span className="text-red-600">−{formatCurrency(Number(row.management_fee_cents) / 100)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Maintenance deductions</span>
                    <span className="text-red-600">−{formatCurrency(Number(row.maintenance_deductions_cents) / 100)}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-200 pt-3 text-base">
                    <span className="font-semibold">Amount (by check)</span>
                    <span className="font-bold" style={{ color: "#0f3c52" }}>{formatCurrency(net)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Memo</span>
                    <span>Owner payout — {row.period_start} to {row.period_end}</span>
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
