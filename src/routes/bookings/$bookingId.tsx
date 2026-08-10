import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useRef, useEffect } from "react";
import { DashboardLayout } from "~/lib/layout";
import { formatCurrency, formatDate, calculateFees, feeConfig, type Payment } from "~/lib/data";
import { fillTemplate } from "~/lib/template-utils";
import { queueEmail, leaseEmailTemplate, guestEmailTemplate } from "~/lib/email";
import { useStore } from "~/lib/store";

export const Route = createFileRoute("/bookings/$bookingId")({
  component: BookingDetailPage,
});

const statusColors: Record<string, string> = {
  confirmed: "bg-blue-100 text-blue-800",
  "checked-in": "bg-green-100 text-green-800",
  "checked-out": "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-800",
};

const sourceLabels: Record<string, string> = {
  direct: "Direct",
  airbnb: "Airbnb",
  "booking.com": "Booking.com",
  vrbo: "VRBO",
};

function BookingDetailPage() {
  const params = Route.useParams();
  const navigate = useNavigate();
  const bookingId = params.bookingId;
  const store = useStore();
  const booking = store.bookings.find((b: any) => b.id === bookingId);
  
  if (!booking) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center">
          <h2 className="text-xl font-semibold text-gray-900">Booking not found</h2>
          <p className="text-gray-500 mt-2">The booking you're looking for doesn't exist.</p>
          <button onClick={() => navigate({ to: "/bookings" })} className="mt-4 btn-primary">Back to Bookings</button>
        </div>
      </DashboardLayout>
    );
  }

  const property = store.properties.find((p: any) => p.id === booking.propertyId);
  const owner = store.owners?.find((o: any) => o.id === property?.ownerId);
  const allPayments = store.payments.filter((p: any) => p.tenantId === booking.id);
  const bookingPayments = allPayments.filter((p: any) => p.method !== "security_deposit");
  const secDepPayments = allPayments.filter((p: any) => p.method === "security_deposit");
  
  const isLongTerm = booking.endDate && booking.startDate
    ? (new Date(booking.endDate).getTime() - new Date(booking.startDate).getTime()) / 86400000 > 30
    : false;

  // ── Payment state ──
  const [showChargeCard, setShowChargeCard] = useState(false);
  const [showACH, setShowACH] = useState(false);
  const [showCheckPayment, setShowCheckPayment] = useState(false);
  const [showUtilCharge, setShowUtilCharge] = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const [showSecDepRecord, setShowSecDepRecord] = useState(false);
  const [showSecDepRefund, setShowSecDepRefund] = useState(false);
  const [showEditDates, setShowEditDates] = useState(false);
  const [showSendEmail, setShowSendEmail] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [statusDropdown, setStatusDropdown] = useState(false);
  const [paySuccess, setPaySuccess] = useState(false);
  const [datesSuccess, setDatesSuccess] = useState(false);
  const [showPhoneEdit, setShowPhoneEdit] = useState(false);

  const [cardAmount, setCardAmount] = useState(0);
  const [cardNumber, setCardNumber] = useState("");
  const [chargeCardSelectedPmId, setChargeCardSelectedPmId] = useState<string>("");
  const [achAmount, setAchAmount] = useState(0);
  const [achSelectedPmId, setAchSelectedPmId] = useState<string>("");
  const [checkAmount, setCheckAmount] = useState(0);
  const [checkNumber, setCheckNumber] = useState("");
  const [checkDate, setCheckDate] = useState(new Date().toISOString().slice(0, 10));
  const [utilityAmount, setUtilityAmount] = useState(0);
  const [utilityDescription, setUtilityDescription] = useState("Utility charge");
  const [utilityPaymentMethod, setUtilityPaymentMethod] = useState<string>("credit_card");
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundMethod, setRefundMethod] = useState<string>("credit_card");
  const [refundDescription, setRefundDescription] = useState("Refund to guest");
  const [secDepAmount, setSecDepAmount] = useState(0);
  const [secDepDescription, setSecDepDescription] = useState("Security deposit");
  const [secDepPaymentMethod, setSecDepPaymentMethod] = useState<string>("credit_card");
  const [secDepRefundAmount, setSecDepRefundAmount] = useState(0);
  const [secDepRefundDescription, setSecDepRefundDescription] = useState("Security deposit refund");
  const [secDepRefundMethod, setSecDepRefundMethod] = useState<string>("credit_card");
  const [utilitySelectedPmId, setUtilitySelectedPmId] = useState<string>("");
  const [refundSelectedPmId, setRefundSelectedPmId] = useState<string>("");
  const [secDepSelectedPmId, setSecDepSelectedPmId] = useState<string>("");
  const [secDepRefundSelectedPmId, setSecDepRefundSelectedPmId] = useState<string>("");
  // Payment Methods tab
  const [showAddPaymentMethod, setShowAddPaymentMethod] = useState(false);
  const [pmType, setPmType] = useState<"credit_card" | "ACH">("credit_card");
  const [pmCardLast4, setPmCardLast4] = useState("");
  const [pmCardBrand, setPmCardBrand] = useState("visa");
  const [pmCardExpiry, setPmCardExpiry] = useState("");
  const [pmBillingAddress, setPmBillingAddress] = useState("");
  const [pmBankName, setPmBankName] = useState("");
  const [pmAcctLast4, setPmAcctLast4] = useState("");
  const [pmRoutingLast4, setPmRoutingLast4] = useState("");
  const [pmAccountType, setPmAccountType] = useState<"checking" | "savings">("checking");
  const [editCheckIn, setEditCheckIn] = useState(booking.startDate);
  const [editCheckOut, setEditCheckOut] = useState(booking.endDate);
  const [phoneEdit, setPhoneEdit] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  // ── Tab & modification state ──
  const [activeTab, setActiveTab] = useState<"general" | "history" | "communication" | "documents" | "payment-methods" | "modify" | "commission">("general");
  const [modifyCheckIn, setModifyCheckIn] = useState(booking.startDate);
  const [modifyCheckOut, setModifyCheckOut] = useState(booking.endDate);
  const [modifyRate, setModifyRate] = useState(booking.nightlyRate);
  const [modifySuccess, setModifySuccess] = useState(false);
  const [showAddendum, setShowAddendum] = useState(false);
  const [addendumSent, setAddendumSent] = useState(false);
  const originalValues = useRef({ startDate: booking.startDate, endDate: booking.endDate, nightlyRate: booking.nightlyRate, totalAmount: booking.totalAmount });
  const [commRate, setCommRate] = useState(Math.round(booking.commissionRate * 100));
  const [commCustom, setCommCustom] = useState(false);
  const [commSuccess, setCommSuccess] = useState(false);

  // ── Derived data ──
  const nights = useMemo(() => {
    if (!booking.startDate || !booking.endDate) return 0;
    return Math.round((new Date(booking.endDate).getTime() - new Date(booking.startDate).getTime()) / 86400000);
  }, [booking.startDate, booking.endDate]);

  const monthlyGrid = useMemo(() => {
    if (!isLongTerm || !booking.startDate || !booking.endDate) return null;
    const start = new Date(booking.startDate);
    const end = new Date(booking.endDate);
    const months: { month: string; due: number; paid: number }[] = [];
    let cursor = new Date(start);
    while (cursor < end) {
      const key = cursor.toISOString().slice(0, 7);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const daysInMonth = Math.min(
        (Math.min(end.getTime(), monthEnd.getTime()) - cursor.getTime()) / 86400000,
        new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
      );
      const due = Math.round(daysInMonth * booking.nightlyRate);
      const paid = bookingPayments
        .filter((p: any) => p.date?.startsWith(key) || p.dueDate?.startsWith(key))
        .reduce((s: number, p: any) => s + (p.amount > 0 ? p.amount : 0), 0);
      months.push({ month: key, due, paid });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    return months;
  }, [isLongTerm, booking.startDate, booking.endDate, booking.totalAmount, bookingPayments]);

  const paymentsTotal = bookingPayments.reduce((s: number, p: any) => s + p.amount, 0);
  const totalDue = booking.totalAmount;
  const balanceDue = Math.max(0, totalDue - paymentsTotal);

  const fees = useMemo(() => calculateFees(nights, booking.nightlyRate, { cleaningFee: booking.cleaningFee, linenFee: booking.linenFee, taxAmount: booking.taxAmount }), [nights, booking.nightlyRate, booking.cleaningFee, booking.linenFee, booking.taxAmount]);
  const paymentMethodsForBooking = useMemo(() => store.paymentMethods.filter((pm: any) => pm.bookingId === booking.id), [store.paymentMethods, booking.id]);

  const secDepPaid = secDepPayments.filter((p: any) => p.amount > 0).reduce((s: number, p: any) => s + p.amount, 0);
  const secDepRefunded = secDepPayments.filter((p: any) => p.amount < 0).reduce((s: number, p: any) => s + Math.abs(p.amount), 0);
  const secDepRequired = booking.securityDeposit || 0;
  const secDepNet = secDepPaid - secDepRefunded;
  const secDepStatus = secDepRequired === 0 ? "none" : secDepNet >= secDepRequired ? "funded" : secDepNet > 0 ? "partial" : "unfunded";

  const modifyNights = Math.max(1, Math.round((new Date(modifyCheckOut).getTime() - new Date(modifyCheckIn).getTime()) / 86400000));
  const modifyTotal = modifyRate * modifyNights;

  const currentCommission = Math.round(booking.totalAmount * booking.commissionRate);
  const newCommission = Math.round(booking.totalAmount * (commRate / 100));

  // ── Helpers ──
  const logActivity = (action: string) => {
    const log = (booking.activityLog || []).slice();
    log.push({ timestamp: new Date().toISOString(), action, user: "Admin" });
    store.updateBooking(bookingId, { activityLog: log });
  };

  const relativeTime = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return formatDate(ts);
  };

  // ── Handlers ──
  const handleChargeCard = (e: React.FormEvent) => {
    e.preventDefault();
    store.addPayment({
      propertyId: booking.propertyId, tenantId: booking.id,
      amount: cardAmount || balanceDue,
      date: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
      status: "completed", method: "credit_card" as Payment["method"],
      description: (chargeCardSelectedPmId ? `Card payment — ${booking.guestName} — ` + (paymentMethodsForBooking.find(pm => pm.id === chargeCardSelectedPmId)?.label || "") : `Card payment — ${booking.guestName}`),
    });
    logActivity(`Card payment of ${formatCurrency(cardAmount || balanceDue)} recorded`);
    setPaySuccess(true);
    setTimeout(() => { setShowChargeCard(false); setPaySuccess(false); setCardAmount(0); setCardNumber(""); setChargeCardSelectedPmId(""); }, 1500);
  };

  const handleACH = (e: React.FormEvent) => {
    e.preventDefault();
    store.addPayment({
      propertyId: booking.propertyId, tenantId: booking.id,
      amount: achAmount || balanceDue,
      date: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
      status: "completed", method: "ACH" as Payment["method"],
      description: (achSelectedPmId ? `ACH payment — ${booking.guestName} — ` + (paymentMethodsForBooking.find(pm => pm.id === achSelectedPmId)?.label || "") : `ACH payment — ${booking.guestName}`),
    });
    logActivity(`ACH payment of ${formatCurrency(achAmount || balanceDue)} recorded`);
    setPaySuccess(true);
    setTimeout(() => { setShowACH(false); setPaySuccess(false); setAchAmount(0); setAchSelectedPmId(""); }, 1500);
  };

  const handleCheckPayment = (e: React.FormEvent) => {
    e.preventDefault();
    store.addPayment({
      propertyId: booking.propertyId, tenantId: booking.id,
      amount: checkAmount || balanceDue,
      date: checkDate, dueDate: checkDate,
      status: "completed", method: "check" as Payment["method"],
      description: `Check #${checkNumber} — ${booking.guestName}`,
    });
    logActivity(`Check #${checkNumber} payment of ${formatCurrency(checkAmount || balanceDue)} recorded`);
    setPaySuccess(true);
    setTimeout(() => { setShowCheckPayment(false); setPaySuccess(false); setCheckAmount(0); setCheckNumber(""); }, 1500);
  };

  const handleUtilityCharge = (e: React.FormEvent) => {
    e.preventDefault();
    store.addPayment({
      propertyId: booking.propertyId, tenantId: booking.id,
      amount: utilityAmount,
      date: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
      status: "completed", method: utilityPaymentMethod as Payment["method"],
      description: (utilitySelectedPmId ? utilityDescription + " \u2014 " + (paymentMethodsForBooking.find(pm => pm.id === utilitySelectedPmId)?.label || "") : utilityDescription) || "Utility charge",
      commissionable: false,
    });
    logActivity(`Utility charge of ${formatCurrency(utilityAmount)} recorded: ${utilityDescription}`);
    setPaySuccess(true);
    setTimeout(() => { setShowUtilCharge(false); setPaySuccess(false); setUtilityAmount(0); setUtilityPaymentMethod("credit_card"); setUtilityDescription("Utility charge"); setUtilitySelectedPmId(""); }, 1500);
  };

  const handleRefund = (e: React.FormEvent) => {
    e.preventDefault();
    store.addPayment({
      propertyId: booking.propertyId, tenantId: booking.id,
      amount: -Math.abs(refundAmount),
      date: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
      status: "completed", method: refundMethod as Payment["method"],
      description: (refundSelectedPmId ? refundDescription + " \u2014 " + (paymentMethodsForBooking.find(pm => pm.id === refundSelectedPmId)?.label || "") : refundDescription) || "Refund to guest",
    });
    logActivity(`Refund of ${formatCurrency(refundAmount)} issued via ${refundMethod}`);
    setPaySuccess(true);
    setTimeout(() => { setShowRefund(false); setPaySuccess(false); setRefundAmount(0); setRefundMethod("credit_card"); setRefundDescription("Refund to guest"); setRefundSelectedPmId(""); }, 1500);
  };

  const handleSecDepRecord = (e: React.FormEvent) => {
    e.preventDefault();
    store.addPayment({
      propertyId: booking.propertyId, tenantId: booking.id,
      amount: secDepAmount,
      date: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
      status: "completed", method: secDepPaymentMethod as Payment["method"],
      description: (secDepSelectedPmId ? secDepDescription + " \u2014 " + (paymentMethodsForBooking.find(pm => pm.id === secDepSelectedPmId)?.label || "") : secDepDescription) || "Security deposit",
      commissionable: false,
    });
    logActivity(`Security deposit of ${formatCurrency(secDepAmount)} recorded`);
    setPaySuccess(true);
    setTimeout(() => { setShowSecDepRecord(false); setPaySuccess(false); setSecDepAmount(0); setSecDepPaymentMethod("credit_card"); setSecDepDescription("Security deposit"); setSecDepSelectedPmId(""); }, 1500);
  };

  const handleSecDepRefund = (e: React.FormEvent) => {
    e.preventDefault();
    store.addPayment({
      propertyId: booking.propertyId, tenantId: booking.id,
      amount: -Math.abs(secDepRefundAmount),
      date: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
      status: "completed", method: secDepRefundMethod as Payment["method"],
      description: (secDepRefundSelectedPmId ? secDepRefundDescription + " \u2014 " + (paymentMethodsForBooking.find(pm => pm.id === secDepRefundSelectedPmId)?.label || "") : secDepRefundDescription) || "Security deposit refund",
      commissionable: false,
    });
    logActivity(`Security deposit refund of ${formatCurrency(secDepRefundAmount)} issued via ${secDepRefundMethod}`);
    setPaySuccess(true);
    setTimeout(() => { setShowSecDepRefund(false); setPaySuccess(false); setSecDepRefundAmount(0); setSecDepRefundMethod("credit_card"); setSecDepRefundDescription("Security deposit refund"); setSecDepRefundSelectedPmId(""); }, 1500);
  };

  const handleAddPaymentMethod = (e: React.FormEvent) => {
    e.preventDefault();
    const label = pmType === "credit_card"
      ? `${pmCardBrand.charAt(0).toUpperCase() + pmCardBrand.slice(1)} ••••${pmCardLast4} exp ${pmCardExpiry}`
      : `${pmBankName} ${pmAccountType === "checking" ? "Checking" : "Savings"} ••••${pmAcctLast4}`;
    store.addStoredPaymentMethod({
      bookingId: booking.id,
      type: pmType,
      label,
      cardLast4: pmType === "credit_card" ? pmCardLast4 : undefined,
      cardBrand: pmType === "credit_card" ? pmCardBrand : undefined,
      cardExpiry: pmType === "credit_card" ? pmCardExpiry : undefined,
      bankName: pmType === "ACH" ? pmBankName : undefined,
      accountLast4: pmType === "ACH" ? pmAcctLast4 : undefined,
      routingLast4: pmType === "ACH" ? pmRoutingLast4 : undefined,
      accountType: pmType === "ACH" ? pmAccountType : undefined,
      billingAddress: pmType === "credit_card" ? pmBillingAddress : undefined,
      createdAt: new Date().toISOString(),
    });
    logActivity(`Payment method added: ${label}`);
    setPaySuccess(true);
    setTimeout(() => { setShowAddPaymentMethod(false); setPaySuccess(false); }, 1000);
  };
  const handleEditDates = (e: React.FormEvent) => {
    e.preventDefault();
    store.updateBooking(bookingId, { startDate: editCheckIn, endDate: editCheckOut });
    logActivity(`Dates changed to ${editCheckIn} – ${editCheckOut}`);
    setDatesSuccess(true);
    setTimeout(() => { setShowEditDates(false); setDatesSuccess(false); }, 1500);
  };

  const handleCancelBooking = () => {
    store.updateBooking(bookingId, { status: "cancelled" });
    logActivity("Booking cancelled");
    setShowCancelConfirm(false);
  };

  const handleChangeStatus = (newStatus: "confirmed" | "checked-in" | "checked-out" | "cancelled") => {
    store.updateBooking(bookingId, { status: newStatus });
    logActivity(`Status changed to ${newStatus}`);
    setStatusDropdown(false);
  };

  const handleModify = () => {
    store.updateBooking(bookingId, {
      startDate: modifyCheckIn,
      endDate: modifyCheckOut,
      nightlyRate: modifyRate,
      totalAmount: modifyTotal,
    });
    logActivity(`Reservation modified: ${modifyCheckIn}–${modifyCheckOut}, ${formatCurrency(modifyRate)}/night, new total ${formatCurrency(modifyTotal)}`);
    setModifySuccess(true);
    setTimeout(() => setModifySuccess(false), 2000);
  };

  const handleGenerateAddendum = async () => {
    const tmpl = store.documentTemplates.find((t: any) => t.type === "addendum");
    if (!tmpl) return;
    const orig = originalValues.current;
    const origNights = Math.round((new Date(orig.endDate).getTime() - new Date(orig.startDate).getTime()) / 86400000);
    const newNights = modifyNights;
    const content = fillTemplate(tmpl.content, {
      propertyName: property?.name || "Unknown",
      propertyAddress: property?.address || "",
      guestName: booking.guestName,
      reservationNumber: booking.reservationNumber,
      originalCheckIn: formatDate(orig.startDate),
      originalCheckOut: formatDate(orig.endDate),
      originalNights: String(origNights),
      originalRate: formatCurrency(orig.nightlyRate),
      originalTotal: formatCurrency(orig.totalAmount),
      newCheckIn: formatDate(modifyCheckIn),
      newCheckOut: formatDate(modifyCheckOut),
      newNights: String(newNights),
      newRate: formatCurrency(modifyRate),
      newTotal: formatCurrency(modifyTotal),
      today: new Date().toLocaleDateString(),
    });
    const docId = String(Date.now());
    store.addDocument({
      bookingId: booking.id,
      propertyId: booking.propertyId,
      ownerId: property?.ownerId || "",
      type: "addendum",
      title: `Addendum — ${booking.guestName} (${property?.name || "Property"})`,
      sentTo: booking.guestEmail,
      sentToName: booking.guestName,
      status: "draft",
      content,
      createdAt: new Date().toISOString(),
    });
    const html = content.replace(/\n/g, "<br/>");
    await queueEmail({
      to: booking.guestEmail,
      toName: booking.guestName,
      subject: `Addendum for Reservation #${booking.reservationNumber}`,
      html,
    });
    logActivity("Addendum generated and sent to guest");
    setAddendumSent(true);
    setTimeout(() => { setShowAddendum(false); setAddendumSent(false); }, 2000);
  };

  const handleUpdateCommission = () => {
    store.updateBooking(bookingId, { commissionRate: commRate / 100 });
    logActivity(`Commission rate updated to ${commRate}%`);
    setCommSuccess(true);
    setTimeout(() => setCommSuccess(false), 2000);
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await queueEmail({
      to: booking.guestEmail,
      toName: booking.guestName,
      subject: emailSubject,
      html: `<p>${emailBody.replace(/\n/g, "<br/>")}</p>`,
    });
    if (result.success) {
      const emailLog = [...(booking.emailLog || [])];
      emailLog.push({
        id: Date.now().toString(),
        subject: emailSubject,
        direction: "sent",
        date: new Date().toISOString(),
        preview: emailBody.slice(0, 80) + (emailBody.length > 80 ? "..." : ""),
      });
      store.updateBooking(bookingId, { emailLog });
      logActivity(`Email sent: "${emailSubject}"`);
    }
    setShowSendEmail(false);
    setEmailSubject("");
    setEmailBody("");
  };

  // ── Render ──
  return (
    <DashboardLayout>
      <div className="flex items-center gap-3 mb-3">
        <button onClick={() => navigate({ to: "/bookings" })} className="text-gray-400 hover:text-gray-600 text-sm">← Bookings</button>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-600">Reservation #{booking.reservationNumber}</span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{booking.guestName}</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm font-semibold" style={{ color: "#0f3c52" }}>Reservation #{booking.reservationNumber}</p>
            <span className={`badge text-xs ${statusColors[booking.status]}`}>{booking.status}</span>
            <span className="text-xs text-gray-400">{sourceLabels[booking.source] || booking.source}</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Created {formatDate(booking.createdAt)} by {booking.createdBy}</p>
        </div>
        <div className="relative">
          <button onClick={() => setStatusDropdown(!statusDropdown)} className="btn-secondary text-sm gap-1.5">Change Status ▾</button>
          {statusDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setStatusDropdown(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 w-44 card shadow-lg py-1">
                {(["confirmed", "checked-in", "checked-out", "cancelled"] as const).map(s => (
                  <button key={s} onClick={() => handleChangeStatus(s)}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${booking.status === s ? "font-semibold" : ""}`}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-0 -mb-px">
          {(["general", "history", "communication", "documents", "payment-methods", "modify", "commission"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-[#0f3c52] text-[#0f3c52]"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}>
              {tab === "general" ? "General" : tab === "history" ? "History" : tab === "communication" ? "Communication" : tab === "documents" ? "Documents" : tab === "payment-methods" ? "💳 Payment Methods" : tab === "modify" ? "Modify Reservation" : "Commission"}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "general" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Guest & Property Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="card p-4">
                <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Guest Information</h3>
                <p className="font-semibold text-gray-900">{booking.guestName}</p>
                <p className="text-sm text-gray-500">{booking.guestEmail}</p>
                {booking.guestAddress ? (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-sm text-gray-500">📍 {booking.guestAddress}</span>
                  </div>
                ) : null}
                {booking.guestPhone ? (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-sm text-gray-500">📱 {booking.guestPhone}</span>
                    <button onClick={() => { setPhoneEdit(booking.guestPhone ?? ""); setShowPhoneEdit(true); }} className="text-xs text-[#0f3c52] hover:underline ml-1">Edit</button>
                  </div>
                ) : (
                  <button onClick={() => { setPhoneEdit(""); setShowPhoneEdit(true); }} className="text-xs text-[#0f3c52] hover:underline font-medium mt-1 inline-block">+ Add phone</button>
                )}
                {showPhoneEdit && (
                  <div className="flex items-center gap-1 mt-2">
                    <input className="input-field text-sm flex-1" placeholder="555-0123" value={phoneEdit} onChange={e => setPhoneEdit(e.target.value)} autoFocus />
                    <button onClick={() => { store.updateBooking(bookingId, { guestPhone: phoneEdit.trim() || undefined }); setShowPhoneEdit(false); }} className="text-xs bg-[#0f3c52] text-white px-2 py-1 rounded">Save</button>
                    <button onClick={() => setShowPhoneEdit(false)} className="text-xs text-gray-400 px-2 py-1">✕</button>
                  </div>
                )}
                {sourceLabels[booking.source] && (
                  <span className="badge bg-gray-100 text-gray-700 mt-2 inline-block text-xs">{sourceLabels[booking.source]}</span>
                )}
              </div>
              <div className="card p-4">
                <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Property</h3>
                <p className="font-semibold text-gray-900">{property?.name || "Unknown"}</p>
                <p className="text-sm text-gray-500">{property?.address}</p>
                {owner && <p className="text-xs text-gray-400 mt-1">Owner: {owner.name} • {owner.phone}</p>}
                <p className="text-sm font-medium mt-2" style={{ color: "#0f3c52" }}>
                  {formatCurrency(booking.nightlyRate)}<span className="text-xs text-gray-400 font-normal">/night</span>
                </p>
              </div>
            </div>

            {/* Stay Details */}
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs text-gray-500 uppercase tracking-wider">Stay Details</h3>
                <button onClick={() => { setEditCheckIn(booking.startDate); setEditCheckOut(booking.endDate); setDatesSuccess(false); setShowEditDates(true); }} className="text-xs text-[#0f3c52] hover:underline font-medium">Edit Dates</button>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">Check-in</p>
                  <p className="text-sm font-semibold mt-1">{formatDate(booking.startDate)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">Check-out</p>
                  <p className="text-sm font-semibold mt-1">{formatDate(booking.endDate)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">Nights</p>
                  <p className="text-lg font-bold mt-1" style={{ color: "#0f3c52" }}>{nights}</p>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-3 flex-wrap">
              <button onClick={() => { setEmailSubject(`Your stay at ${property?.name || "RentVue"}`); setEmailBody(`Dear ${booking.guestName},\n\nThank you for your reservation.\n\nCheck-in: ${formatDate(booking.startDate)}\nCheck-out: ${formatDate(booking.endDate)}\n\nBest regards,\nRentVue Team`); setShowSendEmail(true); }} className="btn-secondary text-xs py-2">✉️ Send Email</button>
              <button onClick={() => setShowCancelConfirm(true)} className="btn-secondary text-xs py-2 text-red-600 border-red-200 hover:bg-red-50">Cancel Booking</button>
            </div>

            {/* Payment Schedule */}
            {isLongTerm && monthlyGrid && (
              <div className="card p-4">
                <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Monthly Payment Grid</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-gray-500 border-b">
                      <th className="py-1.5">Month</th><th className="py-1.5 text-right">Due</th><th className="py-1.5 text-right">Paid</th><th className="py-1.5 text-right">Balance</th>
                    </tr></thead>
                    <tbody>
                      {monthlyGrid.map((m: any) => (
                        <tr key={m.month} className="border-b">
                          <td className="py-1.5 font-medium">{m.month}</td>
                          <td className="py-1.5 text-right">{formatCurrency(m.due)}</td>
                          <td className="py-1.5 text-right text-green-700">{formatCurrency(m.paid)}</td>
                          <td className="py-1.5 text-right font-medium">{formatCurrency(Math.max(0, m.due - m.paid))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Balance Bar */}
            <div className="card p-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">Total</span>
                <span className="font-medium">{formatCurrency(totalDue)}</span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">Paid</span>
                <span className="text-green-700 font-medium">{formatCurrency(paymentsTotal)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold border-t pt-2">
                <span>Balance Due</span>
                <span className={balanceDue > 0 ? "text-red-600" : "text-green-700"}>{formatCurrency(balanceDue)}</span>
              </div>
            </div>

            {/* Fee Breakdown */}
            <div className="card p-4">
              <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Fee Breakdown</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-600">Subtotal ({nights} nights)</span><span>{formatCurrency(fees.subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Cleaning Fee</span><span>{formatCurrency(fees.cleaningFee)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Linen Fee</span><span>{formatCurrency(fees.linenFee)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Commission ({Math.round(booking.commissionRate * 100)}%)</span><span className="text-red-600">-{formatCurrency(Math.round((fees.subtotal + fees.cleaningFee + fees.linenFee) * booking.commissionRate * 100) / 100)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Utilities (no commission)</span><span>{formatCurrency(bookingPayments.filter((p: any) => p.method === "utility" && p.amount > 0).reduce((s: number, p: any) => s + p.amount, 0))}</span></div>
                <div className="border-t pt-2 flex justify-between font-bold"><span>Total</span><span>{formatCurrency(fees.total)}</span></div>
              </div>
            </div>

            {/* Security Deposit */}
            <div className="card p-4">
              <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Security Deposit</h3>
              {secDepRequired > 0 ? (
                <div className="space-y-2 text-sm mb-3">
                  <div className="flex justify-between"><span className="text-gray-600">Required</span><span>{formatCurrency(secDepRequired)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Paid</span><span className="text-green-700">{formatCurrency(secDepPaid)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Refunded</span><span className="text-red-600">{formatCurrency(secDepRefunded)}</span></div>
                  <div className="border-t pt-2 flex justify-between font-bold"><span>Net Balance</span><span>{formatCurrency(secDepNet)}</span></div>
                  <div className="text-center mt-1">
                    {secDepStatus === "funded" ? <span className="badge bg-green-100 text-green-800 text-xs">🟢 Fully Funded</span>
                    : secDepStatus === "partial" ? <span className="badge bg-yellow-100 text-yellow-800 text-xs">🟡 Partial</span>
                    : <span className="badge bg-red-100 text-red-800 text-xs">🔴 Unfunded</span>}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 mb-3">$0 — not configured for this booking.</p>
              )}
              <div className="flex gap-2">
                <button onClick={() => { setSecDepAmount(0); setSecDepPaymentMethod("credit_card"); setSecDepDescription("Security deposit"); setSecDepSelectedPmId(""); setPaySuccess(false); setShowSecDepRecord(true); }} className="border border-teal-300 text-teal-700 hover:bg-teal-50 rounded-lg text-xs flex-1 py-2 font-medium">💰 Record Security Deposit</button>
                <button onClick={() => { setSecDepRefundAmount(0); setSecDepRefundMethod("credit_card"); setSecDepRefundDescription("Security deposit refund"); setSecDepRefundSelectedPmId(""); setPaySuccess(false); setShowSecDepRefund(true); }} className="border border-teal-300 text-teal-700 hover:bg-teal-50 rounded-lg text-xs flex-1 py-2 font-medium">↩ Refund Security Deposit</button>
              </div>
            </div>

            {/* Payment Actions */}
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => { setCardAmount(balanceDue); setPaySuccess(false); setChargeCardSelectedPmId(""); setShowChargeCard(true); }} className="btn-accent text-xs flex-1 py-2 min-w-[80px]">💳 Charge Card</button>
              <button onClick={() => { setAchAmount(balanceDue); setPaySuccess(false); setAchSelectedPmId(""); setShowACH(true); }} className="btn-secondary text-xs flex-1 py-2 min-w-[80px]">🏦 Charge ACH</button>
              <button onClick={() => { setCheckAmount(balanceDue); setPaySuccess(false); setShowCheckPayment(true); }} className="btn-secondary text-xs flex-1 py-2 min-w-[80px]">📝 Record Check</button>
              <button onClick={() => { setUtilityAmount(0); setUtilityPaymentMethod("credit_card"); setUtilityDescription("Utility charge"); setUtilitySelectedPmId(""); setPaySuccess(false); setShowUtilCharge(true); }} className="btn-secondary text-xs flex-1 py-2 min-w-[80px]">📋 Record Utility</button>
              <button onClick={() => { setRefundAmount(0); setRefundMethod("credit_card"); setRefundDescription("Refund to guest"); setRefundSelectedPmId(""); setPaySuccess(false); setShowRefund(true); }} className="border border-red-300 text-red-700 hover:bg-red-50 rounded-lg text-xs flex-1 py-2 font-medium min-w-[80px]">↩ Refund</button>
            </div>

            {/* Payments Table */}
            <div className="card p-4">
              <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Payments</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-gray-500 border-b">
                    <th className="py-1.5">Date</th><th className="py-1.5">Description</th><th className="py-1.5">Method</th><th className="py-1.5 text-right">Amount</th>
                  </tr></thead>
                  <tbody>
                    {bookingPayments.concat(secDepPayments).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((p: any) => (
                      <tr key={p.id || Math.random()} className="border-b">
                        <td className="py-1.5 text-xs text-gray-500">{formatDate(p.date)}</td>
                        <td className="py-1.5">{p.description}</td>
                        <td className="py-1.5 capitalize">
                          {p.method === "utility" ? <span className="badge bg-amber-100 text-amber-800 text-[10px]">⚡ utility</span>
                          : p.method === "security_deposit" ? <span className="badge bg-teal-100 text-teal-800 text-[10px]">🔒 deposit</span>
                          : p.method === "credit_card" ? <span className="badge bg-blue-100 text-blue-800 text-[10px]">💳 card</span>
                          : p.method === "ACH" ? <span className="badge bg-indigo-100 text-indigo-800 text-[10px]">🏦 ACH</span>
                          : p.method.replace("_", " ")}
                        </td>
                        <td className={`py-1.5 text-right font-medium ${p.amount < 0 ? "text-red-600" : ""}`}>
                          {p.amount < 0 ? <span className="badge bg-red-100 text-red-800 text-[10px] mr-1">refund</span> : null}
                          {formatCurrency(p.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "history" && (
        <div className="card p-6 max-w-3xl">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Activity Timeline</h3>
          {booking.activityLog && booking.activityLog.length > 0 ? (
            <div className="space-y-0">
              {booking.activityLog.slice().reverse().map((entry: any, i: number) => (
                <div key={i} className="flex gap-4 py-3 border-b last:border-b-0">
                  <div className="text-xs text-gray-400 whitespace-nowrap min-w-[80px]">{relativeTime(entry.timestamp)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">{entry.action}</p>
                    <p className="text-xs text-gray-400">{entry.user} • {formatDate(entry.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No activity recorded yet.</p>
          )}
        </div>
      )}

      {activeTab === "communication" && (
        <div className="card p-6 max-w-3xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Email History</h3>
            <button onClick={() => { setEmailSubject(""); setEmailBody(""); setShowSendEmail(true); }} className="btn-primary text-xs">✉️ Send Email</button>
          </div>
          {booking.emailLog && booking.emailLog.length > 0 ? (
            <div className="space-y-0">
              {booking.emailLog.slice().reverse().map((email: any) => (
                <div key={email.id} className="flex gap-4 py-3 border-b last:border-b-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 ${email.direction === "sent" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                    {email.direction === "sent" ? "Sent" : "Received"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{email.subject}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{email.preview}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(email.date)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Email history will appear here when emails are sent to or received from this guest.</p>
          )}
        </div>
      )}

      {activeTab === "payment-methods" && (
        <div className="card p-6 max-w-3xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Payment Methods on File</h3>
            <button onClick={() => { setPmType("credit_card"); setPmCardLast4(""); setPmCardBrand("visa"); setPmCardExpiry(""); setPmBillingAddress(""); setPmBankName(""); setPmAccountType("checking"); setPmAcctLast4(""); setPmRoutingLast4(""); setShowAddPaymentMethod(true); }} className="btn-accent text-xs">+ Add Method</button>
          </div>
          {paymentMethodsForBooking.length > 0 ? (
            <div className="space-y-2">
              {paymentMethodsForBooking.map((pm: any) => (
                <div key={pm.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{pm.type === "credit_card" ? "💳" : pm.type === "ACH" ? "🏦" : "📝"}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{pm.label}</p>
                      <p className="text-xs text-gray-400">
                        {pm.type === "credit_card" && pm.cardLast4 ? `••••${pm.cardLast4} | ${pm.cardBrand || ""} | Exp ${pm.cardExpiry || ""}` : ""}
                        {pm.type === "ACH" && pm.bankName ? `${pm.bankName} | Acct ••••${pm.accountLast4} | Routing ••••${pm.routingLast4}` : ""}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => { store.removeStoredPaymentMethod(pm.id); }} className="text-red-500 hover:text-red-700 text-xs font-medium">Remove</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-3xl mb-3">💳</div>
              <p className="text-sm text-gray-500">No payment methods on file for this booking.</p>
              <p className="text-xs text-gray-400 mt-1">Add a card or bank account to speed up future payments.</p>
            </div>
          )}
        </div>
      )}
      {activeTab === "modify" && (
        <div className="card p-6 max-w-lg">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Modify Reservation</h3>
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-3 mb-4">⚠️ Changing dates or rates will recalculate the total amount due.</p>
          
          {modifySuccess ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-gray-900 font-medium">Reservation updated!</p>
              <p className="text-sm text-gray-500 mt-1">New total: {formatCurrency(modifyTotal)}</p>
              {!showAddendum ? (
                <button onClick={() => setShowAddendum(true)} className="mt-4 border-2 border-[#0f3c52] text-[#0f3c52] hover:bg-[#0f3c52] hover:text-white rounded-lg text-sm font-medium py-2 px-6 transition-colors">
                  📄 Generate Addendum
                </button>
              ) : addendumSent ? (
                <div className="mt-4 text-center">
                  <div className="text-2xl mb-1">📨</div>
                  <p className="text-sm text-green-700 font-medium">Addendum sent to {booking.guestEmail}!</p>
                </div>
              ) : (
                <div className="mt-4 card p-4 text-left border-2 border-[#0f3c52] bg-blue-50/30">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Addendum Preview</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-4">
                    <div className="text-gray-500">Check-in:</div>
                    <div><span className="text-gray-400 line-through mr-2">{formatDate(originalValues.current.startDate)}</span> → <span className="font-medium">{formatDate(modifyCheckIn)}</span></div>
                    <div className="text-gray-500">Check-out:</div>
                    <div><span className="text-gray-400 line-through mr-2">{formatDate(originalValues.current.endDate)}</span> → <span className="font-medium">{formatDate(modifyCheckOut)}</span></div>
                    <div className="text-gray-500">Nights:</div>
                    <div><span className="text-gray-400 line-through mr-2">{Math.round((new Date(originalValues.current.endDate).getTime() - new Date(originalValues.current.startDate).getTime()) / 86400000)}</span> → <span className="font-medium">{modifyNights}</span></div>
                    <div className="text-gray-500">Rate:</div>
                    <div><span className="text-gray-400 line-through mr-2">{formatCurrency(originalValues.current.nightlyRate)}</span> → <span className="font-medium">{formatCurrency(modifyRate)}</span></div>
                    <div className="text-gray-500 font-semibold">Total:</div>
                    <div><span className="text-gray-400 line-through mr-2">{formatCurrency(originalValues.current.totalAmount)}</span> → <span className="font-bold text-[#0f3c52]">{formatCurrency(modifyTotal)}</span></div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setShowAddendum(false)} className="btn-secondary text-xs flex-1">Cancel</button>
                    <button onClick={handleGenerateAddendum} className="btn-accent text-xs flex-1">✉️ Send Addendum</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Check-in Date</label>
                <input className="input-field" type="date" value={modifyCheckIn} onChange={e => setModifyCheckIn(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Check-out Date</label>
                <input className="input-field" type="date" value={modifyCheckOut} onChange={e => setModifyCheckOut(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Nightly Rate</label>
                <input className="input-field" type="number" step="0.01" value={modifyRate || ""} onChange={e => setModifyRate(Number(e.target.value))} />
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">
                  New total will be: <span className="font-bold text-gray-900">{formatCurrency(modifyTotal)}</span>
                  {modifyTotal !== booking.totalAmount && (
                    <span className="text-xs text-gray-400 ml-1">(was {formatCurrency(booking.totalAmount)})</span>
                  )}
                </p>
                <p className="text-xs text-gray-400 mt-1">{modifyNights} nights × {formatCurrency(modifyRate)}/night</p>
              </div>
              <button onClick={handleModify} className="btn-accent w-full">Apply Changes</button>
            </div>
          )}
        </div>
      )}

      {activeTab === "commission" && (
        <div className="card p-6 max-w-lg">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Commission Settings</h3>
          
          {commSuccess ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-gray-900 font-medium">Commission updated to {commRate}%!</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Current Rate: <span className="font-bold">{Math.round(booking.commissionRate * 100)}%</span></p>
                <p className="text-xs text-gray-400 mt-1">Current commission: {formatCurrency(currentCommission)} on {formatCurrency(booking.totalAmount)}</p>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">
                  New Rate: <span className="font-bold text-gray-900">{commRate}%</span>
                  {!commCustom && <span className="text-gray-400 font-normal ml-1">(select preset or custom)</span>}
                </label>
                <div className="flex gap-2 flex-wrap mb-2">
                  {[10, 15, 20, 25].map(rate => (
                    <button key={rate} onClick={() => { setCommRate(rate); setCommCustom(false); }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${commRate === rate ? "bg-[#0f3c52] text-white border-[#0f3c52]" : "bg-white text-gray-700 border-gray-200 hover:border-[#0f3c52]"}`}>
                      {rate}%
                    </button>
                  ))}
                  <button onClick={() => setCommCustom(true)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${commCustom ? "bg-[#0f3c52] text-white border-[#0f3c52]" : "bg-white text-gray-700 border-gray-200 hover:border-[#0f3c52]"}`}>
                    Custom
                  </button>
                </div>
                {commCustom && (
                  <input className="input-field" type="number" min="0" max="100" value={commRate} onChange={e => setCommRate(Number(e.target.value))} />
                )}
              </div>
              
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">
                  Current commission: <span className="font-bold">{formatCurrency(currentCommission)}</span>
                  {commRate !== Math.round(booking.commissionRate * 100) && (
                    <> → New commission: <span className="font-bold text-[#0f3c52]">{formatCurrency(newCommission)}</span></>
                  )}
                </p>
              </div>
              
              <button onClick={handleUpdateCommission} className="btn-accent w-full">Update Commission</button>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}

      {/* Add Payment Method Modal */}
      {showAddPaymentMethod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowAddPaymentMethod(false)} />
          <div className="relative z-10 bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-sm mx-4">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add Payment Method</h2>
              <button onClick={() => setShowAddPaymentMethod(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            {paySuccess ? (
              <div className="p-6 text-center"><div className="text-4xl mb-3">✅</div><p className="text-gray-900 font-medium">Method added!</p></div>
            ) : (
              <form onSubmit={handleAddPaymentMethod} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                  <select className="input-field" value={pmType} onChange={e => setPmType(e.target.value as "credit_card" | "ACH")}>
                    <option value="credit_card">💳 Credit Card</option>
                    <option value="ACH">🏦 ACH Transfer</option>
                  </select>
                </div>
                {pmType === "credit_card" ? (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Last 4 Digits</label>
                      <input className="input-field" maxLength={4} value={pmCardLast4} onChange={e => setPmCardLast4(e.target.value.replace(/\D/g,""))} placeholder="4242" required />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Card Brand</label>
                      <select className="input-field" value={pmCardBrand} onChange={e => setPmCardBrand(e.target.value)}>
                        <option value="visa">Visa</option>
                        <option value="mastercard">Mastercard</option>
                        <option value="amex">Amex</option>
                        <option value="discover">Discover</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Expiry (MM/YY)</label>
                      <input className="input-field" maxLength={5} value={pmCardExpiry} onChange={e => setPmCardExpiry(e.target.value)} placeholder="12/27" required />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Billing Address</label>
                      <input className="input-field" value={pmBillingAddress} onChange={e => setPmBillingAddress(e.target.value)} placeholder="123 Main St, Austin, TX 78701" />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Bank Name</label>
                      <input className="input-field" value={pmBankName} onChange={e => setPmBankName(e.target.value)} placeholder="Chase" required />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Account Type</label>
                      <select className="input-field" value={pmAccountType} onChange={e => setPmAccountType(e.target.value as "checking" | "savings")}>
                        <option value="checking">Checking</option>
                        <option value="savings">Savings</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Account Number</label>
                      <input className="input-field" value={pmAcctLast4} onChange={e => setPmAcctLast4(e.target.value.replace(/\D/g,""))} placeholder="Full account number" required />
                      <p className="text-[10px] text-gray-400 mt-1">Only last 4 stored for display — full number used for processing</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Routing Number</label>
                      <input className="input-field" value={pmRoutingLast4} onChange={e => setPmRoutingLast4(e.target.value.replace(/\D/g,""))} placeholder="Full routing number" required />
                    </div>
                  </>
                )}
                <button type="submit" className="btn-accent w-full">Save Payment Method</button>
              </form>
            )}
          </div>
        </div>
      )}
      {/* Charge Card Modal */}
      {showChargeCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowChargeCard(false)} />
          <div className="relative z-10 bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-sm mx-4">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Charge Card</h2>
              <button onClick={() => setShowChargeCard(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            {paySuccess ? (
              <div className="p-6 text-center"><div className="text-4xl mb-3">✅</div><p className="text-gray-900 font-medium">Payment recorded!</p></div>
            ) : (
              <form onSubmit={handleChargeCard} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
                  <input className="input-field" type="number" step="0.01" value={cardAmount || ""} onChange={e => setCardAmount(Number(e.target.value))} placeholder="0.00" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Payment Method</label>
                  {paymentMethodsForBooking.filter((pm: any) => pm.type === "credit_card").length === 0 ? (
                    <p className="text-[10px] text-amber-600 mt-1">No cards on file — add one in 💳 Payment Methods.</p>
                  ) : (
                    <select className="input-field" value={chargeCardSelectedPmId} onChange={e => setChargeCardSelectedPmId(e.target.value)}>
                      <option value="">— Any card —</option>
                      {paymentMethodsForBooking.filter((pm: any) => pm.type === "credit_card").map((pm: any) => (
                        <option key={pm.id} value={pm.id}>{pm.label}</option>
                      ))}
                    </select>
                  )}
                </div>
                <button type="submit" className="btn-accent w-full">Charge {formatCurrency(cardAmount || balanceDue)}</button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Charge ACH Modal */}
      {showACH && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowACH(false)} />
          <div className="relative z-10 bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-sm mx-4">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Charge ACH</h2>
              <button onClick={() => setShowACH(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            {paySuccess ? (
              <div className="p-6 text-center"><div className="text-4xl mb-3">✅</div><p className="text-gray-900 font-medium">ACH payment recorded!</p></div>
            ) : (
              <form onSubmit={handleACH} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
                  <input className="input-field" type="number" step="0.01" value={achAmount || ""} onChange={e => setAchAmount(Number(e.target.value))} placeholder="0.00" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Payment Method</label>
                  {paymentMethodsForBooking.filter((pm: any) => pm.type === "ACH").length === 0 ? (
                    <p className="text-[10px] text-amber-600 mt-1">No ACH accounts on file — add one in 💳 Payment Methods.</p>
                  ) : (
                    <select className="input-field" value={achSelectedPmId} onChange={e => setAchSelectedPmId(e.target.value)}>
                      <option value="">— Any account —</option>
                      {paymentMethodsForBooking.filter((pm: any) => pm.type === "ACH").map((pm: any) => (
                        <option key={pm.id} value={pm.id}>{pm.label}</option>
                      ))}
                    </select>
                  )}
                </div>
                <button type="submit" className="btn-accent w-full">Charge {formatCurrency(achAmount || balanceDue)} via ACH</button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Record Check Modal */}
      {showCheckPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowCheckPayment(false)} />
          <div className="relative z-10 bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-sm mx-4">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Record Check</h2>
              <button onClick={() => setShowCheckPayment(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            {paySuccess ? (
              <div className="p-6 text-center"><div className="text-4xl mb-3">✅</div><p className="text-gray-900 font-medium">Check recorded!</p></div>
            ) : (
              <form onSubmit={handleCheckPayment} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
                  <input className="input-field" type="number" step="0.01" value={checkAmount || ""} onChange={e => setCheckAmount(Number(e.target.value))} placeholder="0.00" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Check #</label>
                  <input className="input-field" value={checkNumber} onChange={e => setCheckNumber(e.target.value)} placeholder="1234" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
                  <input className="input-field" type="date" value={checkDate} onChange={e => setCheckDate(e.target.value)} />
                </div>
                <button type="submit" className="btn-accent w-full">Record Check</button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Record Utility Modal */}
      {showUtilCharge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowUtilCharge(false)} />
          <div className="relative z-10 bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-sm mx-4">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Record Utility Charge</h2>
              <button onClick={() => setShowUtilCharge(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            {paySuccess ? (
              <div className="p-6 text-center"><div className="text-4xl mb-3">✅</div><p className="text-gray-900 font-medium">Utility recorded!</p></div>
            ) : (
              <form onSubmit={handleUtilityCharge} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
                  <input className="input-field" type="number" step="0.01" value={utilityAmount || ""} onChange={e => setUtilityAmount(Number(e.target.value))} placeholder="0.00" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Payment Method</label>
                  <select className="input-field" value={utilityPaymentMethod} onChange={e => setUtilityPaymentMethod(e.target.value)}>
                    <option value="credit_card">💳 Credit Card</option>
                    <option value="ACH">🏦 ACH Transfer</option>
                    <option value="check">📝 Check</option>
                  </select>
                  {utilityPaymentMethod !== "check" && paymentMethodsForBooking.filter((pm) => pm.type === utilityPaymentMethod).length > 0 ? (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Specific Method</label>
                      <select className="input-field" value={utilitySelectedPmId} onChange={e => setUtilitySelectedPmId(e.target.value)}>
                        <option value="">— Any {utilityPaymentMethod === "credit_card" ? "card" : "account"} —</option>
                        {paymentMethodsForBooking.filter((pm) => pm.type === utilityPaymentMethod).map(pm => (
                          <option key={pm.id} value={pm.id}>{pm.label}</option>
                        ))}
                      </select>
                    </div>
                  ) : utilityPaymentMethod !== "check" ? (
                    <p className="text-[10px] text-amber-600 mt-1">No {utilityPaymentMethod === "credit_card" ? "cards" : "accounts"} on file — add one in 💳 Payment Methods.</p>
                  ) : null}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                  <input className="input-field" value={utilityDescription} onChange={e => setUtilityDescription(e.target.value)} placeholder="Utility charge" />
                </div>
                <button type="submit" className="btn-accent w-full">Record {formatCurrency(utilityAmount || 0)}</button>
              </form>
            )}
          </div>
        </div>
      )}
{/* Refund Modal */}
      {showRefund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowRefund(false)} />
          <div className="relative z-10 bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-sm mx-4">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Issue Refund</h2>
              <button onClick={() => setShowRefund(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            {paySuccess ? (
              <div className="p-6 text-center"><div className="text-4xl mb-3">✅</div><p className="text-gray-900 font-medium">Refund issued!</p></div>
            ) : (
              <form onSubmit={handleRefund} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
                  <input className="input-field" type="number" step="0.01" value={refundAmount || ""} onChange={e => setRefundAmount(Number(e.target.value))} placeholder="0.00" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Refund Method</label>
                  <select className="input-field" value={refundMethod} onChange={e => setRefundMethod(e.target.value)}>
                    <option value="credit_card">💳 Credit Card</option>
                    <option value="ACH">🏦 ACH Transfer</option>
                    <option value="check">📝 Check</option>
                  </select>
                  {refundMethod !== "check" && paymentMethodsForBooking.filter((pm) => pm.type === refundMethod).length > 0 ? (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Specific Method</label>
                      <select className="input-field" value={refundSelectedPmId} onChange={e => setRefundSelectedPmId(e.target.value)}>
                        <option value="">— Any {refundMethod === "credit_card" ? "card" : "account"} —</option>
                        {paymentMethodsForBooking.filter((pm) => pm.type === refundMethod).map(pm => (
                          <option key={pm.id} value={pm.id}>{pm.label}</option>
                        ))}
                      </select>
                    </div>
                  ) : refundMethod !== "check" ? (
                    <p className="text-[10px] text-amber-600 mt-1">No {refundMethod === "credit_card" ? "cards" : "accounts"} on file — add one in 💳 Payment Methods.</p>
                  ) : null}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                  <input className="input-field" value={refundDescription} onChange={e => setRefundDescription(e.target.value)} placeholder="Refund to guest" />
                </div>
                <button type="submit" className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 px-4 rounded-lg w-full transition-colors">Refund {formatCurrency(refundAmount || 0)}</button>
              </form>
            )}
          </div>
        </div>
      )}
{/* Record Security Deposit Modal */}
      {showSecDepRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowSecDepRecord(false)} />
          <div className="relative z-10 bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-sm mx-4">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Record Security Deposit</h2>
              <button onClick={() => setShowSecDepRecord(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            {paySuccess ? (
              <div className="p-6 text-center"><div className="text-4xl mb-3">✅</div><p className="text-gray-900 font-medium">Security deposit recorded!</p></div>
            ) : (
              <form onSubmit={handleSecDepRecord} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
                  <input className="input-field" type="number" step="0.01" value={secDepAmount || ""} onChange={e => setSecDepAmount(Number(e.target.value))} placeholder="0.00" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Payment Method</label>
                  <select className="input-field" value={secDepPaymentMethod} onChange={e => setSecDepPaymentMethod(e.target.value)}>
                    <option value="credit_card">💳 Credit Card</option>
                    <option value="ACH">🏦 ACH Transfer</option>
                    <option value="check">📝 Check</option>
                  </select>
                  {secDepPaymentMethod !== "check" && paymentMethodsForBooking.filter((pm: any) => pm.type === secDepPaymentMethod).length > 0 ? (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Specific Method</label>
                      <select className="input-field" value={secDepSelectedPmId} onChange={e => setSecDepSelectedPmId(e.target.value)}>
                        <option value="">— Any {secDepPaymentMethod === "credit_card" ? "card" : "account"} —</option>
                        {paymentMethodsForBooking.filter((pm: any) => pm.type === secDepPaymentMethod).map((pm: any) => (
                          <option key={pm.id} value={pm.id}>{pm.label}</option>
                        ))}
                      </select>
                    </div>
                  ) : secDepPaymentMethod !== "check" ? (
                    <p className="text-[10px] text-amber-600 mt-1">No {secDepPaymentMethod === "credit_card" ? "cards" : "accounts"} on file — add one in 💳 Payment Methods.</p>
                  ) : null}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                  <input className="input-field" value={secDepDescription} onChange={e => setSecDepDescription(e.target.value)} placeholder="Security deposit" />
                </div>
                <button type="submit" className="btn-accent w-full">Record {formatCurrency(secDepAmount || 0)}</button>
              </form>
            )}
          </div>
        </div>
      )}
{/* Refund Security Deposit Modal */}
      {showSecDepRefund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowSecDepRefund(false)} />
          <div className="relative z-10 bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-sm mx-4">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Refund Security Deposit</h2>
              <button onClick={() => setShowSecDepRefund(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            {paySuccess ? (
              <div className="p-6 text-center"><div className="text-4xl mb-3">✅</div><p className="text-gray-900 font-medium">Refund issued!</p></div>
            ) : (
              <form onSubmit={handleSecDepRefund} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
                  <input className="input-field" type="number" step="0.01" value={secDepRefundAmount || ""} onChange={e => setSecDepRefundAmount(Number(e.target.value))} placeholder="0.00" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Refund Method</label>
                  <select className="input-field" value={secDepRefundMethod} onChange={e => setSecDepRefundMethod(e.target.value)}>
                    <option value="credit_card">💳 Credit Card</option>
                    <option value="ACH">🏦 ACH Transfer</option>
                    <option value="check">📝 Check</option>
                  </select>
                  {secDepRefundMethod !== "check" && paymentMethodsForBooking.filter((pm) => pm.type === secDepRefundMethod).length > 0 ? (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Specific Method</label>
                      <select className="input-field" value={secDepRefundSelectedPmId} onChange={e => setSecDepRefundSelectedPmId(e.target.value)}>
                        <option value="">— Any {secDepRefundMethod === "credit_card" ? "card" : "account"} —</option>
                        {paymentMethodsForBooking.filter((pm) => pm.type === secDepRefundMethod).map(pm => (
                          <option key={pm.id} value={pm.id}>{pm.label}</option>
                        ))}
                      </select>
                    </div>
                  ) : secDepRefundMethod !== "check" ? (
                    <p className="text-[10px] text-amber-600 mt-1">No {secDepRefundMethod === "credit_card" ? "cards" : "accounts"} on file — add one in 💳 Payment Methods.</p>
                  ) : null}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                  <input className="input-field" value={secDepRefundDescription} onChange={e => setSecDepRefundDescription(e.target.value)} placeholder="Security deposit refund" />
                </div>
                <button type="submit" className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 px-4 rounded-lg w-full transition-colors">Refund {formatCurrency(secDepRefundAmount || 0)}</button>
              </form>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

