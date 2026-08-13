import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { DashboardLayout } from "~/lib/layout";
import {
  properties,
  tenants,
  formatCurrency,
  formatDate,
  getStatusColor,
} from "~/lib/data";
import type { Payment } from "~/lib/data";
import { useStore } from "~/lib/store";
import { useAuth } from "~/lib/auth";
import { convenienceFeeCents, convenienceFeeLabel, type PaymentMethod } from "~/lib/fees";

export const Route = createFileRoute("/payments")({
  component: PaymentsPage,
});

type FilterTab = "all" | "paid" | "pending" | "overdue";
const br = "#0f3c52";
const PER_PAGE = 25;

// ── helpers ──

const todayStr = () => new Date().toISOString().slice(0, 10);

// ── CSV export ──
function exportCsv(rows: (Payment & { propertyName: string })[]) {
  const header = ["Description", "Property", "Due Date", "Method", "Amount", "Status"];
  const lines = rows.map((r) =>
    [
      `"${r.description.replace(/"/g, '""')}"`,
      `"${r.propertyName.replace(/"/g, '""')}"`,
      r.dueDate,
      r.method,
      r.amount,
      r.status,
    ].join(","),
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `payments-${todayStr()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function PaymentsPage() {
  const { payments, addPayment, updatePaymentStatus } = useStore();

  // ── state ──
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [propFilter, setPropFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  // checkout state
  const [checkoutPayment, setCheckoutPayment] = useState<string | null>(null);
  const [checkoutMethod, setCheckoutMethod] = useState<PaymentMethod>("credit card");
  const [checkoutStep, setCheckoutStep] = useState<"select" | "processing" | "done" | "started">("select");
  const [checkoutError, setCheckoutError] = useState("");
  const [payNotice, setPayNotice] = useState("");

  // record-payment form state
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [rp, setRp] = useState({
    propertyId: "",
    tenantId: "",
    amount: 0,
    dueDate: todayStr(),
    method: "credit card" as PaymentMethod,
    description: "",
  });

  // ── Stripe Connect status (real companies only; demo stays on the mock path) ──
  const { user } = useAuth();
  const companyId = user?.companyId;
  const [connect, setConnect] = useState<{ accountId: string | null; onboardingComplete: boolean; isDemo: boolean } | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectError, setConnectError] = useState("");

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const { fetchConnectStatus } = await import("~/lib/db-queries");
        const st = await fetchConnectStatus({ data: { companyId } });
        if (!cancelled) setConnect(st);
      } catch {
        // Non-fatal: page still works with local/mock payments.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  // Checkout return banners (success/cancel URLs point back here with ?checkout=…)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      setPayNotice("Payment completed in Stripe — it will be confirmed in the list shortly.");
    } else if (params.get("checkout") === "cancelled") {
      setPayNotice("Payment was not completed — the payment is still pending. You can try again anytime.");
    }
  }, []);

  const enableConnect = async () => {
    if (!companyId || connectBusy) return;
    setConnectBusy(true);
    setConnectError("");
    try {
      const { createConnectAccount, getOnboardingLink } = await import("~/lib/db-queries");
      let url: string | null = null;
      if (!connect?.accountId) {
        const created = await createConnectAccount({ data: { companyId } });
        setConnect((c) => (c ? { ...c, accountId: created.accountId } : c));
        url = created.onboardingUrl;
      } else {
        const link = await getOnboardingLink({ data: { accountId: connect.accountId } });
        url = link.url;
      }
      if (url) window.open(url, "_blank", "noopener");
    } catch (e: any) {
      setConnectError(e?.message || "Could not start Stripe onboarding.");
    }
    setConnectBusy(false);
  };

  // ── derived data ──
  const propertyMap = useMemo(() => {
    const m: Record<string, (typeof properties)[number]> = {};
    properties.forEach((p) => (m[p.id] = p));
    return m;
  }, []);

  const tenantMap = useMemo(() => {
    const m: Record<string, (typeof tenants)[number]> = {};
    tenants.forEach((t) => (m[t.id] = t));
    return m;
  }, []);

  // enriched payments with property name
  const enriched = useMemo(
    () =>
      payments.map((p) => ({
        ...p,
        propertyName: propertyMap[p.propertyId]?.name ?? "—",
      })),
    [payments, propertyMap],
  );

  // filtered list
  const filtered = useMemo(() => {
    let list = enriched;

    // status tab
    if (filterTab !== "all") list = list.filter((p) => p.status === filterTab);

    // search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.description.toLowerCase().includes(q) ||
          p.propertyName.toLowerCase().includes(q) ||
          (tenantMap[p.tenantId]?.name ?? "").toLowerCase().includes(q),
      );
    }

    // property filter
    if (propFilter !== "all") list = list.filter((p) => p.propertyId === propFilter);

    // date range
    if (dateFrom) list = list.filter((p) => p.dueDate >= dateFrom);
    if (dateTo) list = list.filter((p) => p.dueDate <= dateTo);

    return list;
  }, [enriched, filterTab, search, propFilter, dateFrom, dateTo, tenantMap]);

  // pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  // summary numbers (always from full payments, not filtered)
  const totalCollected = payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const totalPending = payments.filter((p) => p.status === "pending").reduce((s, p) => s + p.amount, 0);
  const totalOverdue = payments.filter((p) => p.status === "overdue").reduce((s, p) => s + p.amount, 0);

  // ── checkout helpers ──
  const onlineReady = !!(connect && !connect.isDemo && connect.onboardingComplete);

  const openCheckout = (payId: string) => {
    // Real company that hasn't enabled online payments → point them at onboarding / manual record.
    if (connect && !connect.isDemo && !connect.onboardingComplete) {
      setPayNotice("Online payments aren't enabled for this account yet — enable them in Settings → Payments, or record the payment manually.");
      return;
    }
    setCheckoutPayment(payId);
    setCheckoutMethod("credit card");
    setCheckoutStep("select");
    setCheckoutError("");
  };

  const processCheckout = async () => {
    if (!checkoutPayment) return;
    const pay = payments.find((p) => p.id === checkoutPayment);
    if (!pay) return;

    // Real Stripe path (onboarded company): open hosted Checkout on the connected
    // account, mark the row pending. The completed state arrives via the
    // payment_intent.succeeded webhook (Chunk D) — we never fake it here.
    if (onlineReady && checkoutMethod !== "check") {
      setCheckoutStep("processing");
      setCheckoutError("");
      try {
        const { createCheckoutSession } = await import("~/lib/db-queries");
        const result = await createCheckoutSession({
          data: {
            companyId: companyId!,
            amountCents: Math.round(pay.amount * 100),
            paymentType: pay.description?.toLowerCase().includes("deposit") ? "deposit" : "charge",
            method: checkoutMethod === "ACH" ? "ach" : "card",
            bookingId: pay.bookingId,
            propertyId: pay.propertyId || undefined,
          },
        });
        if (result.mock || !result.url) {
          updatePaymentStatus(checkoutPayment, "paid");
          setCheckoutStep("done");
          return;
        }
        updatePaymentStatus(checkoutPayment, "pending");
        window.open(result.url, "_blank", "noopener");
        setCheckoutStep("started");
      } catch (e: any) {
        setCheckoutError(e?.message || "Could not start online payment. Try again or record the payment manually.");
        setCheckoutStep("select");
      }
      return;
    }

    // Demo / manual (check) path — mock processing keeps demoability.
    setCheckoutStep("processing");
    setTimeout(() => {
      updatePaymentStatus(checkoutPayment, "paid");
      setCheckoutStep("done");
    }, 2000);
  };

  const closeCheckout = () => {
    setCheckoutPayment(null);
    setCheckoutStep("select");
    setCheckoutError("");
  };

  const checkoutPay = checkoutPayment ? payments.find((p) => p.id === checkoutPayment) : null;
  // Guest-paid convenience fee (new model): the guest pays booking + fee; the
  // PM receives 100% of the booking. Store amounts are dollars (mapDbPayment
  // divides by 100) — pass cents so the modal's fee/total match the actual
  // charge (e.g. $1,000 card → guest pays $1,035.00, PM nets $1,000).
  const checkoutFee = checkoutPay ? convenienceFeeCents(Math.round(checkoutPay.amount * 100), checkoutMethod) : 0;

  // ── record payment ──
  const handleRecord = () => {
    if (!rp.propertyId || !rp.tenantId || rp.amount <= 0) return;

    const newPay = addPayment({
      propertyId: rp.propertyId,
      tenantId: rp.tenantId,
      amount: rp.amount,
      date: todayStr(),
      dueDate: rp.dueDate,
      status: "paid",
      method: rp.method,
      description: rp.description || "Manual payment",
    });

    // Reset form and close
    setRp({ propertyId: "", tenantId: "", amount: 0, dueDate: todayStr(), method: "credit card", description: "" });
    setShowRecordModal(false);
  };

  // ── filtered tenants for record form ──
  const filteredTenants = useMemo(
    () => (rp.propertyId ? tenants.filter((t) => t.propertyId === rp.propertyId) : []),
    [rp.propertyId],
  );

  return (
    <DashboardLayout currentPath="/payments">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
            <p className="mt-1 text-sm text-gray-500">Track and process all rent and booking payments</p>
          </div>
          <button onClick={() => setShowRecordModal(true)} className="btn-primary gap-2">
            <span>+</span> Record Payment
          </button>
        </div>

        {/* Stripe Connect banner — real companies only (demo stays on mock path) */}
        {connect && !connect.isDemo && !connect.onboardingComplete && (
          <div className="card flex items-center justify-between gap-4 flex-wrap" style={{ borderLeft: `4px solid ${br}` }}>
            <div className="min-w-[260px] flex-1">
              <h2 className="text-base font-semibold text-gray-900">
                {connect.accountId ? "Finish enabling online payments" : "Enable online payments"}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {connect.accountId
                  ? "Your Stripe account was created — complete the hosted onboarding to start collecting rent and booking payments online."
                  : "Collect rent and booking payments online with your own Stripe account. You stay the merchant of record — Guests pay a convenience fee (3.5% card / 1% + $0.25 ACH); you receive 100% of every booking."}
              </p>
              {connectError && <p className="mt-1 text-sm text-red-600">{connectError}</p>}
            </div>
            <button
              onClick={enableConnect}
              disabled={connectBusy}
              className="btn-primary gap-2 shrink-0"
              style={{ backgroundColor: br }}
            >
              {connectBusy ? "Opening…" : connect.accountId ? "Resume onboarding" : "Enable online payments"}
            </button>
          </div>
        )}

        {/* Payment notice (checkout returns / not-enabled info) */}
        {payNotice && (
          <div className="card flex items-center justify-between gap-3 flex-wrap" style={{ borderLeft: "4px solid #b45309" }}>
            <p className="text-sm text-gray-700 flex-1 min-w-[240px]">{payNotice}</p>
            <button onClick={() => setPayNotice("")} className="text-gray-400 hover:text-gray-600 text-lg leading-none" aria-label="Dismiss">
              &times;
            </button>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="stat-card border-l-4 border-l-green-500">
            <p className="text-sm text-gray-500">Collected</p>
            <p className="text-3xl font-bold mt-1 text-green-600">{formatCurrency(totalCollected)}</p>
            <p className="text-xs text-gray-400 mt-1">
              {payments.filter((p) => p.status === "paid").length} transactions
            </p>
          </div>
          <div className="stat-card border-l-4 border-l-yellow-500">
            <p className="text-sm text-gray-500">Pending</p>
            <p className="text-3xl font-bold mt-1 text-yellow-600">{formatCurrency(totalPending)}</p>
            <p className="text-xs text-gray-400 mt-1">
              {payments.filter((p) => p.status === "pending").length} transactions
            </p>
          </div>
          <div className="stat-card border-l-4 border-l-red-500">
            <p className="text-sm text-gray-500">Overdue</p>
            <p className="text-3xl font-bold mt-1 text-red-600">{formatCurrency(totalOverdue)}</p>
            <p className="text-xs text-gray-400 mt-1">
              {payments.filter((p) => p.status === "overdue").length} transactions
            </p>
          </div>
        </div>

        {/* Toolbar: filters + search */}
        <div className="space-y-4">
          {/* Filter tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            {(["all", "paid", "pending", "overdue"] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setFilterTab(f); setPage(1); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filterTab === f ? "text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
                style={filterTab === f ? { backgroundColor: br } : {}}
              >
                {f === "all" ? "All" : f === "paid" ? "Paid" : f === "pending" ? "Pending" : "Overdue"}
                <span className="ml-1 text-xs opacity-70">
                  ({f === "all" ? payments.length : payments.filter((p) => p.status === f).length})
                </span>
              </button>
            ))}
          </div>

          {/* Search + filters row */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                className="input-field pl-9 text-sm w-full"
                placeholder="Search description, property, tenant…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>

            {/* Property filter */}
            <select
              className="input-field text-sm w-44"
              value={propFilter}
              onChange={(e) => { setPropFilter(e.target.value); setPage(1); }}
            >
              <option value="all">All Properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {/* Date range */}
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>Due:</span>
              <input
                type="date"
                className="input-field text-sm w-36"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              />
              <span>–</span>
              <input
                type="date"
                className="input-field text-sm w-36"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              />
            </div>

            {/* CSV Export */}
            <button
              onClick={() => exportCsv(filtered)}
              className="btn-secondary text-sm gap-1.5"
              title="Export filtered view to CSV"
            >
              📥 CSV
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">Description</th>
                  <th className="text-left px-6 py-3 font-medium">Property</th>
                  <th className="text-left px-6 py-3 font-medium">Due Date</th>
                  <th className="text-left px-6 py-3 font-medium">Method</th>
                  <th className="text-right px-6 py-3 font-medium">Amount</th>
                  <th className="text-left px-6 py-3 font-medium">Status</th>
                  <th className="text-right px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pageRows.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium">{p.description}</td>
                    <td className="px-6 py-3 text-gray-500">{p.propertyName}</td>
                    <td className="px-6 py-3 text-gray-500">{formatDate(p.dueDate)}</td>
                    <td className="px-6 py-3 capitalize text-gray-500">{p.method}</td>
                    <td className="px-6 py-3 text-right font-medium">{formatCurrency(p.amount)}</td>
                    <td className="px-6 py-3">
                      <span className={`badge ${getStatusColor(p.status)}`}>{p.status}</span>
                      {p.disputeStatus && (
                        <span className="ml-1 inline-block text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold align-middle">
                          ⚠ dispute{p.disputeStatus !== "created" ? `: ${p.disputeStatus}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {p.status !== "paid" && (
                            <button
                              onClick={() => openCheckout(p.id)}
                              className="btn-accent text-xs px-2.5 py-1"
                            >
                              Pay Now
                            </button>
                        )}
                        {p.status === "paid" && (
                          <span className="text-xs text-gray-400">{formatDate(p.date)}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                      No payments match the current filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filtered.length > PER_PAGE && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Showing {(safePage - 1) * PER_PAGE + 1}–{Math.min(safePage * PER_PAGE, filtered.length)} of{" "}
                {filtered.length} payments
              </p>
              <div className="flex items-center gap-2">
                <button
                  className="btn-secondary text-xs px-3 py-1"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ← Prev
                </button>
                <span className="text-sm text-gray-500">
                  {safePage} / {totalPages}
                </span>
                <button
                  className="btn-secondary text-xs px-3 py-1"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════ Record Payment Modal ═══════════════ */}
        {showRecordModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setShowRecordModal(false)}
          >
            <div
              className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Record Payment</h2>
                <button onClick={() => setShowRecordModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">
                  &times;
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
                  <select
                    className="input-field text-sm w-full"
                    value={rp.propertyId}
                    onChange={(e) =>
                      setRp({ ...rp, propertyId: e.target.value, tenantId: "" })
                    }
                  >
                    <option value="">— Select —</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tenant / Guest</label>
                  <select
                    className="input-field text-sm w-full"
                    value={rp.tenantId}
                    onChange={(e) => setRp({ ...rp, tenantId: e.target.value })}
                    disabled={!rp.propertyId}
                  >
                    <option value="">— Select —</option>
                    {filteredTenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                    <input
                      type="number"
                      className="input-field text-sm w-full"
                      min={0}
                      value={rp.amount || ""}
                      onChange={(e) => setRp({ ...rp, amount: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                    <input
                      type="date"
                      className="input-field text-sm w-full"
                      value={rp.dueDate}
                      onChange={(e) => setRp({ ...rp, dueDate: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Method</label>
                    <select
                      className="input-field text-sm w-full"
                      value={rp.method}
                      onChange={(e) => setRp({ ...rp, method: e.target.value as PaymentMethod })}
                    >
                      <option value="credit card">Credit Card</option>
                      <option value="ACH">ACH</option>
                      <option value="check">Check</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <input
                      className="input-field text-sm w-full"
                      placeholder="e.g. July Rent"
                      value={rp.description}
                      onChange={(e) => setRp({ ...rp, description: e.target.value })}
                    />
                  </div>
                </div>

                {rp.amount > 0 && (
                  <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Subtotal</span>
                      <span>{formatCurrency(rp.amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">
                        "No fee — you receive 100% of the booking"
                      </span>
                      <span>{formatCurrency(0)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1 font-semibold">
                      <span>Total</span>
                      <span>{formatCurrency(rp.amount)}</span>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowRecordModal(false)} className="btn-secondary flex-1 text-sm">
                    Cancel
                  </button>
                  <button
                    onClick={handleRecord}
                    className="btn-accent flex-1 text-sm"
                    disabled={!rp.propertyId || !rp.tenantId || rp.amount <= 0}
                  >
                    Record Payment
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════ Checkout Modal (existing) ═══════════════ */}
        {checkoutPayment && checkoutPay && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={checkoutStep === "select" ? closeCheckout : undefined}
          >
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {checkoutStep === "processing"
                    ? "Opening secure checkout…"
                    : checkoutStep === "done"
                      ? "Payment Complete!"
                      : checkoutStep === "started"
                        ? "Payment started"
                        : "Checkout"}
                </h2>
                {checkoutStep !== "processing" && (
                  <button onClick={closeCheckout} className="text-gray-400 hover:text-gray-600 text-xl">
                    &times;
                  </button>
                )}
              </div>

              {checkoutStep === "select" && (
                <div className="p-6 space-y-4">
                  {checkoutError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{checkoutError}</div>
                  )}
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Description</span>
                      <span className="font-medium">{checkoutPay.description}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Due Date</span>
                      <span>{formatDate(checkoutPay.dueDate)}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setCheckoutMethod("credit card")}
                        className={`p-3 border rounded-lg text-left transition-all ${
                          checkoutMethod === "credit card"
                            ? "border-[#0f3c52] bg-blue-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="text-xl mb-1">💳</div>
                        <p className="text-sm font-medium">Credit Card</p>
                        <p className="text-xs text-gray-400 mt-0.5">3.5% convenience fee</p>
                      </button>
                      <button
                        onClick={() => setCheckoutMethod("ACH")}
                        className={`p-3 border rounded-lg text-left transition-all ${
                          checkoutMethod === "ACH"
                            ? "border-[#0f3c52] bg-blue-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="text-xl mb-1">🏦</div>
                        <p className="text-sm font-medium">ACH Transfer</p>
                        <p className="text-xs text-gray-400 mt-0.5">1% + $0.25 convenience fee</p>
                      </button>
                      {!onlineReady && (
                        <button
                          onClick={() => setCheckoutMethod("check")}
                          className={`p-3 border rounded-lg text-left transition-all ${
                            checkoutMethod === "check"
                              ? "border-[#0f3c52] bg-blue-50"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <div className="text-xl mb-1">📝</div>
                          <p className="text-sm font-medium">Check</p>
                          <p className="text-xs text-gray-400 mt-0.5">No fee</p>
                        </button>
                      )}
                      {onlineReady && (
                        <div className="col-span-2 p-3 border border-dashed border-gray-200 rounded-lg text-xs text-gray-400">
                          📝 Checks aren't processed online — record them manually with <strong>Record Payment</strong>.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Subtotal</span>
                      <span>{formatCurrency(checkoutPay.amount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">
                        {checkoutMethod === "check" ? "No convenience fee" : "Convenience fee (guest pays)"}
                      </span>
                      <span>{formatCurrency(checkoutFee)}</span>
                    </div>
                    <div className="flex justify-between text-base font-semibold border-t pt-2">
                      <span>Total Charged to Payer</span>
                      <span>{formatCurrency(checkoutPay.amount + checkoutFee)}</span>
                    </div>
                    {onlineReady && (
                      <p className="text-xs text-gray-400">
                        The guest pays a {formatCurrency(checkoutFee)} convenience fee on top of your booking amount. You receive 100% of the booking — nothing is deducted from your proceeds.
                      </p>
                    )}
                  </div>

                  <button onClick={processCheckout} className="btn-accent w-full py-3 text-base">
                    {onlineReady ? "Open Secure Checkout" : `Proceed to Payment — ${formatCurrency(checkoutPay.amount + checkoutFee)}`}
                  </button>
                </div>
              )}

              {checkoutStep === "processing" && (
                <div className="p-12 text-center">
                  <div className="animate-spin inline-block w-10 h-10 border-4 border-gray-200 border-t-[#0f3c52] rounded-full mb-4" />
                  <p className="text-gray-500">
                    {onlineReady ? "Opening secure checkout…" : "Processing your payment..."}
                  </p>
                </div>
              )}

              {checkoutStep === "started" && (
                <div className="p-6 space-y-4 text-center">
                  <div className="text-4xl mb-2">💳</div>
                  <p className="text-lg font-medium text-gray-900">Secure checkout opened</p>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Complete the payment in the Stripe window that just opened. This payment is marked{" "}
                    <strong>pending</strong> and will update automatically once Stripe confirms it.
                  </p>
                  <button onClick={closeCheckout} className="btn-primary w-full text-sm">
                    Done
                  </button>
                </div>
              )}

              {checkoutStep === "done" && (
                <div className="p-6 space-y-4">
                  <div className="text-center">
                    <div className="text-4xl mb-2">✅</div>
                    <p className="text-lg font-medium text-green-600">Payment Successful!</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Payment ID</span>
                      <span className="font-mono text-xs">{checkoutPay.id.toUpperCase()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Date</span>
                      <span>{formatDate(todayStr())}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Amount</span>
                      <span className="font-medium">{formatCurrency(checkoutPay.amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Fee</span>
                      <span>{formatCurrency(checkoutFee)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 font-semibold">
                      <span>Total Charged</span>
                      <span>{formatCurrency(checkoutPay.amount + checkoutFee)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Method</span>
                      <span className="capitalize">{checkoutMethod}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Status</span>
                      <span className="text-green-600 font-medium">Paid</span>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button className="btn-secondary flex-1 text-sm">📥 Download Receipt</button>
                    <button onClick={closeCheckout} className="btn-primary flex-1 text-sm">
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
