import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { DashboardLayout } from "~/lib/layout";
import {
  calculateFees, feeConfig,
  formatCurrency, formatDate,
} from "~/lib/data";
import { useStore } from "~/lib/store";
import { useSubscriptionStatus, PLAN_INACTIVE_MSG } from "~/lib/use-subscription";
import type { Booking, CalendarBlock } from "~/lib/data";

export const Route = createFileRoute("/calendar")({
  component: CalendarPage,
});

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type ViewMode = "strip" | "list";

function dateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type Segment = {
  startDay: number;
  endDay: number;
  type: "available" | "booked" | "lease" | "maintenance" | "blocked" | "cancelled";
  label: string;
  bookingId?: string;
  realStart?: string;
  realEnd?: string;
};

const SEGMENT_COLORS: Record<string, string> = {
  available: "bg-gray-100",
  booked: "bg-green-500",
  lease: "bg-blue-500",
  maintenance: "bg-red-500",
  blocked: "bg-purple-500",
  cancelled: "bg-red-200",
};

const SEGMENT_LABELS: Record<string, { short: string; color: string; dot: string }> = {
  booked: { short: "Short Term", color: "#22c55e", dot: "bg-green-500" },
  lease: { short: "Long Term", color: "#3b82f6", dot: "bg-blue-500" },
  maintenance: { short: "Maint", color: "#ef4444", dot: "bg-red-500" },
  blocked: { short: "Owner Block", color: "#8b5cf6", dot: "bg-purple-500" },
  available: { short: "Open", color: "#e5e7eb", dot: "bg-gray-100" },
  cancelled: { short: "CX", color: "#fca5a5", dot: "bg-red-200" },
};

function CalendarPage() {
  const nowDate = new Date();
  const [currentMonth, setCurrentMonth] = useState(nowDate.getMonth());
  const [currentYear, setCurrentYear] = useState(nowDate.getFullYear());
  const store = useStore();
  const sub = useSubscriptionStatus();
  const bookings = store.bookings;
  const calendarBlocks = store.calendarBlocks;
  // Properties/owners always come from the company-scoped store (DB), never
  // the static demo seed — demo data must never leak into a real company.
  const properties = store.properties;
  const storeOwners = store.owners;
  const addBooking = store.addBooking;
  const [viewMode, setViewMode] = useState<ViewMode>("strip");
  const [tooltip, setTooltip] = useState<{ x: number; y: number; prop: string; propId: string; date: string; type: string; label: string; createdAt?: string; createdBy?: string } | null>(null);
  const [propertySearch, setPropertySearch] = useState("");
  const [monthCount, setMonthCount] = useState(1);

  // Date range search + available-only
  const [searchStart, setSearchStart] = useState("");
  const [searchEnd, setSearchEnd] = useState("");
  const [filterAvailable, setFilterAvailable] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);

  // Quick book modal
  const [quickBookProp, setQuickBookProp] = useState("");
  const [quickBookCheckIn, setQuickBookCheckIn] = useState("");
  const [quickBookCheckOut, setQuickBookCheckOut] = useState("");
  const [quickBookGuest, setQuickBookGuest] = useState("");
  const [quickBookEmail, setQuickBookEmail] = useState("");
  const [quickBookPhone, setQuickBookPhone] = useState("");
  const [quickBookSuccess, setQuickBookSuccess] = useState(false);
  const [quickBookError, setQuickBookError] = useState("");
  const [showQuickBook, setShowQuickBook] = useState(false);

  // Full booking modal state (kept from existing)
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [bookStep, setBookStep] = useState<"dates" | "results" | "guest">("dates");
  const [bookCheckIn, setBookCheckIn] = useState("");
  const [bookCheckOut, setBookCheckOut] = useState("");
  const [bookPropId, setBookPropId] = useState("");
  const [bookGuestName, setBookGuestName] = useState("");
  const [bookGuestEmail, setBookGuestEmail] = useState("");
  const [bookGuestPhone, setBookGuestPhone] = useState("");
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookError, setBookError] = useState("");
  const [bookNightlyRate, setBookNightlyRate] = useState(0);
  const [bookCleanFee, setBookCleanFee] = useState(feeConfig.cleaningFee);
  const [bookLinenFeeState, setBookLinenFeeState] = useState(feeConfig.linenFee);
  const [bookCommRate, setBookCommRate] = useState(feeConfig.commissionRate * 100);

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const monthStart = dateStr(currentYear, currentMonth, 1);
  const monthEnd = dateStr(currentYear, currentMonth, daysInMonth);

  // Multi-month display range
  const displayMonths = useMemo(() => {
    const months: { month: number; year: number }[] = [];
    for (let i = 0; i < monthCount; i++) {
      let m = currentMonth + i;
      let y = currentYear;
      while (m > 11) { m -= 12; y++; }
      months.push({ month: m, year: y });
    }
    return months;
  }, [currentMonth, currentYear, monthCount]);

  const monthBookings = bookings.filter(b =>
    (showCancelled || b.status !== "cancelled") && b.startDate <= monthEnd && b.endDate >= monthStart
  );
  const monthBlocks = calendarBlocks.filter(b =>
    b.startDate <= monthEnd && b.endDate >= monthStart
  );

  const prevMonth = () => {
    let m = currentMonth - monthCount;
    let y = currentYear;
    while (m < 0) { m += 12; y--; }
    setCurrentMonth(m);
    setCurrentYear(y);
  };
  const nextMonth = () => {
    let m = currentMonth + monthCount;
    let y = currentYear;
    while (m > 11) { m -= 12; y++; }
    setCurrentMonth(m);
    setCurrentYear(y);
  };

  // Filtered properties (for available-only search)
  const filteredProps = useMemo(() => {
    if (!filterAvailable || !searchStart || !searchEnd) return properties;
    return properties.filter(p => {
      const hasOverlap = bookings.some(b =>
        b.propertyId === p.id && b.status !== "cancelled" &&
        b.startDate <= searchEnd && b.endDate >= searchStart
      );
      const hasBlock = calendarBlocks.some(b =>
        b.propertyId === p.id &&
        b.startDate <= searchEnd && b.endDate >= searchStart
      );
      return !hasOverlap && !hasBlock;
    });
  }, [filterAvailable, searchStart, searchEnd, bookings, calendarBlocks, properties]);

  // Property search filter
  const displayedProps = useMemo(() => {
    if (!propertySearch.trim()) return filteredProps;
    const q = propertySearch.toLowerCase();
    return filteredProps.filter(p => p.name.toLowerCase().includes(q));
  }, [filteredProps, propertySearch]);

  // Build strip segments per month
  const monthStripData = useMemo(() => {
    const map: Record<string, { data: Record<string, Segment[]>; days: number }> = {};
    for (const dm of displayMonths) {
      const key = `${dm.year}-${dm.month}`;
      const dim = new Date(dm.year, dm.month + 1, 0).getDate();
      const mStart = dateStr(dm.year, dm.month, 1);
      const mEnd = dateStr(dm.year, dm.month, dim);

      const mBookings = bookings.filter(b =>
        (showCancelled || b.status !== "cancelled") && b.startDate <= mEnd && b.endDate >= mStart
      );
      const mBlocks = calendarBlocks.filter(b =>
        b.startDate <= mEnd && b.endDate >= mStart
      );

      const result: Record<string, Segment[]> = {};
      for (const prop of displayedProps) {
        const segments: Segment[] = [];
        const events: { start: number; end: number; type: Segment["type"]; label: string; bookingId?: string; realStart?: string; realEnd?: string }[] = [];

        for (const blk of mBlocks) {
          if (blk.propertyId !== prop.id) continue;
          const blkStartDate = new Date(blk.startDate + "T00:00:00");
          const blkEndDate = new Date(blk.endDate + "T00:00:00");
          const monthFirst = new Date(dm.year, dm.month, 1);
          const monthLast = new Date(dm.year, dm.month, dim);
          if (blkEndDate < monthFirst || blkStartDate > monthLast) continue;
          const startDay = blkStartDate >= monthFirst ? blkStartDate.getDate() : 1;
          const endDay = blkEndDate <= monthLast ? blkEndDate.getDate() : dim;
          events.push({ start: startDay, end: endDay, type: blk.type as Segment["type"], label: blk.title, realStart: blk.startDate, realEnd: blk.endDate });
        }

        for (const bk of mBookings) {
          if (bk.propertyId !== prop.id) continue;
          const bkStart = new Date(bk.startDate + "T00:00:00");
          const bkEnd = new Date(bk.endDate + "T00:00:00");
          const monthFirst = new Date(dm.year, dm.month, 1);
          const monthLast = new Date(dm.year, dm.month, dim);
          if (bkEnd < monthFirst || bkStart > monthLast) continue;
          const startDay = bkStart >= monthFirst ? bkStart.getDate() : 1;
          const endDay = bkEnd <= monthLast ? bkEnd.getDate() : dim;
          const bkDurationDays = (bkEnd.getTime() - bkStart.getTime()) / (1000 * 60 * 60 * 24);
          const isLongTerm = bkDurationDays > 183;
          events.push({ start: startDay, end: endDay, type: bk.status === "cancelled" ? "cancelled" : isLongTerm ? "lease" : "booked", label: bk.guestName, bookingId: bk.id, realStart: bk.startDate, realEnd: bk.endDate });
        }

        events.sort((a, b) => {
          const priority: Record<string, number> = { cancelled: 0, booked: 1, lease: 2, maintenance: 3, blocked: 4 };
          return (priority[a.type] ?? 0) - (priority[b.type] ?? 0) || a.start - b.start;
        });

        if (events.length === 0) {
          segments.push({ startDay: 1, endDay: dim, type: "available", label: "Available" });
        } else {
          let cursor = 1;
          for (const ev of events) {
            if (ev.start > cursor) {
              segments.push({ startDay: cursor, endDay: ev.start - 1, type: "available", label: "Available" });
            }
            segments.push({ startDay: ev.start, endDay: ev.end, type: ev.type, label: ev.label, bookingId: ev.bookingId, realStart: ev.realStart, realEnd: ev.realEnd });
            cursor = Math.max(cursor, ev.end + 1);
          }
          if (cursor <= dim) {
            segments.push({ startDay: cursor, endDay: dim, type: "available", label: "Available" });
          }
        }
        result[prop.id] = segments;
      }
      map[key] = { data: result, days: dim };
    }
    return map;
  }, [displayMonths, displayedProps, bookings, calendarBlocks, showCancelled]);

  // Occupancy stats for summary cards
  const occupancyStats = useMemo(() => {
    let totalDays = 0;
    const bookedMap: Record<string, number> = {};
    for (const dm of displayMonths) {
      const key = `${dm.year}-${dm.month}`;
      const msd = monthStripData[key];
      if (!msd) continue;
      totalDays += msd.days;
      for (const prop of displayedProps) {
        if (!bookedMap[prop.id]) bookedMap[prop.id] = 0;
        const segs = msd.data[prop.id] || [];
        for (const s of segs) {
          if (s.type !== "available") {
            bookedMap[prop.id] += (s.endDay - s.startDay + 1);
          }
        }
      }
    }
    return displayedProps.map(prop => {
      const booked = bookedMap[prop.id] || 0;
      return { propId: prop.id, name: prop.name, booked, total: totalDays, pct: totalDays > 0 ? Math.round((booked / totalDays) * 100) : 0 };
    });
  }, [displayMonths, displayedProps, monthStripData]);

  // ─── Booking modal helpers ───
  const isPropAvailable = (propId: string, start: string, end: string) => {
    if (!start || !end) return false;
    const hasBk = bookings.some(b => b.propertyId === propId && b.status !== "cancelled" && b.startDate < end && b.endDate > start);
    const hasBlk = calendarBlocks.some(b => b.propertyId === propId && b.startDate < end && b.endDate > start);
    return !hasBk && !hasBlk;
  };

  const openNewBooking = () => {
    setShowNewBooking(true); setBookStep("dates"); setBookCheckIn(""); setBookCheckOut("");
    setBookPropId(""); setBookGuestName(""); setBookGuestEmail(""); setBookGuestPhone(""); setBookingSuccess(false); setBookError("");
    setBookNightlyRate(0); setBookCleanFee(feeConfig.cleaningFee); setBookLinenFeeState(feeConfig.linenFee); setBookCommRate(feeConfig.commissionRate * 100);
  };

  const openBookNow = (propId: string, start: string, end: string) => {
    // Guard: never open a booking with a check-in in the past. A whole-month
    // "Available" strip (startDay 1) in the current month includes already-past
    // days; clamp the check-in to today so a past date can't be booked. If the
    // clamped window would be zero-length, bump the check-out to be at least
    // one night after today.
    const today = new Date();
    const todayStr = dateStr(today.getFullYear(), today.getMonth(), today.getDate());
    if (start < todayStr) {
      start = todayStr;
      if (end <= start) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        d.setDate(d.getDate() + 1);
        end = dateStr(d.getFullYear(), d.getMonth(), d.getDate());
      }
    }
    setShowNewBooking(true); setBookCheckIn(start); setBookCheckOut(end); setBookPropId(propId);
    setBookStep("guest"); setBookGuestName(""); setBookGuestEmail(""); setBookGuestPhone(""); setBookingSuccess(false); setBookError("");
    setBookNightlyRate(0); setBookCleanFee(feeConfig.cleaningFee); setBookLinenFeeState(feeConfig.linenFee); setBookCommRate(feeConfig.commissionRate * 100);
  };

  const handleStripClick = (propId: string, seg: Segment, monthYear?: { year: number; month: number }) => {
    if ((seg.type === "booked" || seg.type === "lease") && seg.bookingId) {
      window.location.href = "/bookings/" + seg.bookingId;
      return;
    }
    if (seg.type === "lease" && seg.realStart && seg.realEnd) {
      const match = bookings.find(b =>
        b.propertyId === propId &&
        b.startDate <= seg.realEnd! && b.endDate >= seg.realStart! &&
        b.status !== "cancelled"
      );
      if (match) {
        window.location.href = "/bookings/" + match.id;
        return;
      }
      // No matching booking — navigate to properties page
      window.location.href = "/properties";
      return;
    }
    if (seg.type === "available") {
      const my = monthYear || { year: currentYear, month: currentMonth };
      openBookNow(propId, dateStr(my.year, my.month, seg.startDay), dateStr(my.year, my.month, seg.startDay + 1));
    }
  };

  // Quick book
  const openQuickBook = () => { setShowQuickBook(true); setQuickBookProp(""); setQuickBookCheckIn(""); setQuickBookCheckOut(""); setQuickBookGuest(""); setQuickBookEmail(""); setQuickBookPhone(""); setQuickBookSuccess(false); setQuickBookError(""); };
  const submitQuickBook = (e: React.FormEvent) => {
    e.preventDefault();
    const prop = properties.find(p => p.id === quickBookProp);
    const checkIn = quickBookCheckIn || new Date().toISOString().slice(0, 10);
    const checkOut = quickBookCheckOut || new Date().toISOString().slice(0, 10);
    
    // Check availability before booking
    if (!isPropAvailable(quickBookProp, checkIn, checkOut)) {
      setQuickBookError(`"${prop?.name || quickBookProp}" is not available for these dates.`);
      return;
    }
    
    const n = Math.max(1, Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000));
    const rate = prop?.nightlyRate || (prop?.monthlyRent ? Math.round(prop.monthlyRent / 30) : 200);
    addBooking({
      propertyId: quickBookProp,
      guestName: quickBookGuest || "Walk-in",
      guestEmail: quickBookEmail || "walkin@example.com",
      startDate: checkIn,
      endDate: checkOut,
      nightlyRate: rate,
      status: "confirmed",
      totalAmount: n * rate,
      source: "direct",
    });
    setQuickBookSuccess(true);
    setTimeout(() => { setShowQuickBook(false); setQuickBookSuccess(false); }, 1500);
  };

  // Full booking modal
  const handleBookSearch = (e: React.FormEvent) => { e.preventDefault(); if (!bookCheckIn || !bookCheckOut) return; setBookStep("results"); };
  const handleSelectProp = (propId: string) => { setBookPropId(propId); setBookStep("guest"); };
  const handleBookSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Guards — never fake success: property must be chosen and guest fields filled.
    if (!bookPropId) { setBookError("Please choose a property first."); return; }
    if (!bookGuestName.trim() || !bookGuestEmail.trim()) { setBookError("Guest name and email are required."); return; }
    addBooking({
      propertyId: bookPropId,
      guestName: bookGuestName.trim(),
      guestEmail: bookGuestEmail.trim(),
      guestPhone: bookGuestPhone.trim() || undefined,
      startDate: bookCheckIn,
      endDate: bookCheckOut,
      nightlyRate: bookNightlyRate || bookRate,
      status: "confirmed",
      totalAmount: bookTotal,
      source: "direct",
      commissionRate: bookCommRate / 100,
      createdAt: new Date().toISOString(),
      createdBy: "Admin",
      cleaningFee: bookCleanFee,
      linenFee: bookLinenFeeState,
      taxAmount: bookTaxAmount,
    });
    setBookError("");
    setBookingSuccess(true);
    setTimeout(() => { setShowNewBooking(false); setBookingSuccess(false); }, 1500);
  };
  const availableForBook = properties.filter(p => p.type === "short-term" && isPropAvailable(p.id, bookCheckIn, bookCheckOut));
  const bookProp = properties.find(p => p.id === bookPropId);
  const bookNights = bookCheckIn && bookCheckOut ? Math.max(0, Math.ceil((new Date(bookCheckOut).getTime() - new Date(bookCheckIn).getTime()) / 86400000)) : 0;
  const bookRate = bookProp?.nightlyRate || (bookProp?.monthlyRent || 0) / 30;
  const bookSubtotal = bookNights * (bookNightlyRate || bookRate);
  const bookTaxAmount = bookNights >= 185 ? 0 : Math.round(bookSubtotal * feeConfig.taxRate * 100) / 100;
  const bookTotal = bookSubtotal + bookCleanFee + bookLinenFeeState + bookTaxAmount;

  const lsBookings = bookings.length; // DB-backed — same count
  const hydrationOk = bookings.length > 12;

  // Helper: day headers for a given month
  function getDayHeaders(month: number, year: number) {
    const dim = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: dim }, (_, i) => {
      const date = new Date(year, month, i + 1);
      const dayName = ["S", "M", "T", "W", "T", "F", "S"][date.getDay()];
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      return { day: i + 1, dayName, isWeekend };
    });
  }

  return (
    <DashboardLayout currentPath="/calendar">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Booking Calendar</h1>
            <p className="mt-1 text-sm text-gray-500">Property availability at a glance</p>
          </div>
          <div className="flex items-center gap-3">
            {sub.active && !sub.loading ? (
              <button className="btn-accent gap-2" onClick={openNewBooking}>
                <span>+</span> New Booking
              </button>
            ) : (
              <button
                className="btn-accent gap-2 opacity-70"
                title={PLAN_INACTIVE_MSG}
                onClick={() => (window.location.href = "/plan")}
              >
                <span>+</span> New Booking — Plan Required
              </button>
            )}
          </div>
        </div>
        {!sub.active && !sub.loading && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 flex items-center justify-between gap-3">
            <span><strong>Your plan is inactive.</strong> Renew to keep creating bookings — existing data stays viewable.</span>
            <a href="/plan" className="shrink-0 font-medium underline">Choose a plan →</a>
          </div>
        )}

        {/* Date Range Search + Available Only + Quick Book */}
        <div className="card p-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-medium text-gray-500">Search:</span>
            <input type="date" className="input-field text-xs w-36" value={searchStart} onChange={e => { setSearchStart(e.target.value); setFilterAvailable(false); }} placeholder="From" />
            <span className="text-gray-400 text-xs">→</span>
            <input type="date" className="input-field text-xs w-36" value={searchEnd} onChange={e => { setSearchEnd(e.target.value); setFilterAvailable(false); }} placeholder="To" />
            <button
              onClick={() => setFilterAvailable(true)}
              className="px-3 py-1.5 text-xs rounded-lg font-medium text-white"
              style={{ backgroundColor: "#22c55e" }}
              disabled={!searchStart || !searchEnd}
            >
              Available Only
            </button>
            {filterAvailable && (
              <>
                <span className="text-xs text-green-700 font-medium">{filteredProps.length} available</span>
                <button onClick={() => { setFilterAvailable(false); setSearchStart(""); setSearchEnd(""); }} className="px-2 py-1.5 text-xs bg-gray-100 rounded-lg">✕ Clear</button>
              </>
            )}
            <div className="flex-1" />
            <button
              onClick={() => setShowCancelled(!showCancelled)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium border ${showCancelled ? "bg-red-100 text-red-700 border-red-300" : "bg-white text-gray-500 border-gray-200"}`}
            >
              {showCancelled ? "Hide Cancelled" : "Show Cancelled"}
            </button>
            <button onClick={openQuickBook} className="px-3 py-1.5 text-xs rounded-lg font-medium text-white" style={{ backgroundColor: "#0f3c52" }}>
              ⚡ Quick Book
            </button>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={prevMonth} className="btn-secondary px-3 py-1.5 text-sm">←</button>
            <h2 className="text-lg font-semibold">
              {displayMonths.length === 1
                ? `${MONTHS[displayMonths[0].month]} ${displayMonths[0].year}`
                : `${MONTHS[displayMonths[0].month]} ${displayMonths[0].year} — ${MONTHS[displayMonths[displayMonths.length - 1].month]} ${displayMonths[displayMonths.length - 1].year}`}
            </h2>
            <button onClick={nextMonth} className="btn-secondary px-3 py-1.5 text-sm">→</button>
            <button onClick={() => { const d = new Date(); setCurrentMonth(d.getMonth()); setCurrentYear(d.getFullYear()); }} className="btn-secondary px-3 py-1.5 text-sm">Today</button>
            <span className="text-gray-300 mx-1">|</span>
            {([1, 3, 6] as number[]).map(n => (
              <button
                key={n}
                onClick={() => setMonthCount(n)}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium ${monthCount === n ? "bg-[#0f3c52] text-white" : "bg-gray-100 text-gray-600"}`}
              >{n} {n === 1 ? "Month" : "Months"}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {(["strip", "list"] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium capitalize ${viewMode === mode ? "bg-[#0f3c52] text-white" : "bg-gray-100 text-gray-600"}`}
              >{mode === "strip" ? "Chart" : "List"}</button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-5 text-xs text-gray-500">
          {Object.entries(SEGMENT_LABELS).map(([key, val]) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-sm ${val.dot}`}></span> {val.short}
            </span>
          ))}
          <span className="text-gray-300 ml-2">Click booked → details · Click available → book</span>
        </div>

        {/* ─── STRIP CHART VIEW ─── */}
        {viewMode === "strip" && (
          <>
            <div className="card overflow-hidden">
              {/* Outer flex: property names column | scrollable months */}
              <div className="flex">
                {/* Left: Property names column (sticky) */}
                <div className="w-36 shrink-0 border-r border-gray-100 bg-white z-10">
                  {/* Search bar — sits at same height as month header row */}
                  <div className="px-1.5 py-0 border-b border-gray-100 bg-white flex items-center" style={{ height: "28px" }}>
                    <input
                      className="input-field text-[10px] py-0.5 px-1.5 w-full"
                      placeholder="Search properties..."
                      value={propertySearch}
                      onChange={e => setPropertySearch(e.target.value)}
                    />
                  </div>
                  {/* Day header spacer */}
                  <div className="border-b border-gray-100 bg-white" style={{ height: "28px" }} />
                  {/* Property name rows */}
                  {displayedProps.map(prop => (
                    <div key={prop.id} className="px-2 py-0 border-b border-gray-100 h-[30px] flex items-center bg-white/50">
                      <div className="truncate">
                        <p className="text-[11px] font-semibold text-gray-800 truncate">{prop.name}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Right: Months (scrollable horizontally) */}
                <div className="flex-1 overflow-x-auto">
                  {/* Month headers row */}
                  <div className="flex border-b border-gray-100 bg-gray-50/80 sticky top-0 z-10">
                    {displayMonths.map(dm => {
                      const dim = new Date(dm.year, dm.month + 1, 0).getDate();
                      return (
                        <div key={`mh-${dm.year}-${dm.month}`} className="border-r border-gray-200 last:border-r-0" style={{ flex: dim }}>
                          <div className="text-center text-[10px] font-semibold text-gray-500 flex items-center justify-center" style={{ height: "28px" }}>
                            {MONTHS[dm.month]} {dm.year}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Day headers row */}
                  <div className="flex border-b border-gray-100 bg-white sticky top-[28px] z-10">
                    {displayMonths.map(dm => {
                      const dh = getDayHeaders(dm.month, dm.year);
                      return (
                        <div key={`dh-${dm.year}-${dm.month}`} className="flex border-r border-gray-200 last:border-r-0" style={{ flex: dh.length }}>
                          {dh.map(d => (
                            <div
                              key={d.day}
                              className={`flex-1 text-center text-[9px] py-1.5 font-medium leading-tight ${d.isWeekend ? "bg-gray-50/30 text-gray-400" : "text-gray-500"}`}
                            >
                              <span className="block">{d.dayName}</span>
                              <span className="block">{d.day}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>

                  {/* Property strips (scrollable vertically) */}
                  <div className="max-h-[calc(100vh-420px)] overflow-y-auto">
                    {displayedProps.length === 0 && (
                      <div className="text-center py-12 text-gray-400 text-sm">No properties match your search.</div>
                    )}
                    {displayedProps.map(prop => (
                      <div key={prop.id} className="flex border-b border-gray-100 last:border-b-0 h-[30px] hover:bg-gray-50/30">
                        {displayMonths.map(dm => {
                          const key = `${dm.year}-${dm.month}`;
                          const msd = monthStripData[key];
                          const days = msd?.days || 30;
                          const segments = msd?.data[prop.id] || [];
                          return (
                            <div key={`${prop.id}-${key}`} className="flex relative border-r border-gray-200 last:border-r-0" style={{ flex: days }}>
                              {segments.map((seg, i) => {
                                const leftPct = ((seg.startDay - 1) / days) * 100;
                                const widthPct = ((seg.endDay - seg.startDay + 1) / days) * 100;
                                const isClickable = seg.type === "booked" || seg.type === "lease" || seg.type === "cancelled" || seg.type === "available";
                                return (
                                  <div
                                    key={i}
                                    className={`absolute top-0.5 bottom-0.5 rounded ${SEGMENT_COLORS[seg.type]} ${seg.type === "cancelled" ? "border-2 border-red-400 border-dashed" : ""} ${isClickable ? "cursor-pointer hover:brightness-110 hover:shadow-sm" : ""} transition-all`}
                                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                                    onClick={(e) => handleStripClick(prop.id, seg, dm)}
                                    onMouseEnter={(e) => {
                                      const fmtDate = (d: string) => {
                                        const dt = new Date(d + "T00:00:00");
                                        return `${dt.getMonth() + 1}/${dt.getDate()}/${dt.getFullYear()}`;
                                      };
                                      const dateStr = seg.realStart && seg.realEnd && seg.realStart !== seg.realEnd
                                        ? `${fmtDate(seg.realStart)}–${fmtDate(seg.realEnd)}`
                                        : `${MONTHS[dm.month].slice(0, 3)} ${seg.startDay}${seg.startDay !== seg.endDay ? `–${seg.endDay}` : ""}, ${dm.year}`;
                                      const segBooking = seg.bookingId ? bookings.find(b => b.id === seg.bookingId) : undefined;
                                      setTooltip({
                                      x: e.clientX, y: e.clientY,
                                      prop: prop.name,
                                      propId: prop.id,
                                      date: dateStr,
                                      type: seg.type,
                                      label: seg.label,
                                      createdAt: segBooking?.createdAt,
                                      createdBy: segBooking?.createdBy,
                                    })}}
                                    onMouseLeave={() => setTooltip(null)}
                                  >
                                    {seg.type === "booked" && widthPct > 4 && (
                                      <span className="absolute inset-0 flex items-center justify-center text-[9px] text-white font-medium truncate px-1 leading-tight">
                                        {seg.label}
                                      </span>
                                    )}
                                    {seg.type === "cancelled" && widthPct > 5 && (
                                      <span className="absolute inset-0 flex items-center justify-center text-[9px] text-red-700 font-medium truncate px-1 leading-tight line-through">
                                        {seg.label}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tooltip with owner info */}
              {tooltip && (() => {
                const tipProp = properties.find(p => p.id === tooltip.propId);
                const tipOwner = tipProp ? storeOwners.find(o => o.propertyIds.includes(tipProp.id)) : undefined;
                return (
                  <div className="fixed z-50 pointer-events-none" style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}>
                    <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg max-w-[220px]">
                      <p className="font-semibold truncate">{tooltip.prop}</p>
                      {tipOwner && <p className="text-gray-400">{tipOwner.name} · {tipOwner.phone}</p>}
                      <p className="text-white/70">{tooltip.date}</p>
                      <p>
                        <span className="capitalize font-medium">{tooltip.type === "lease" ? "Long Term" : tooltip.type === "booked" ? "Short Term" : tooltip.type === "blocked" ? "Owner Block" : tooltip.type}</span>
                        {tooltip.label && tooltip.label !== "Available" && (
                          <span>: {tooltip.label}</span>
                        )}
                      </p>
                      {tooltip.createdAt && (
                        <p className="text-white/50 text-[10px]">Created {tooltip.createdAt} by {tooltip.createdBy || "Admin"}</p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Occupancy Summary Cards */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                📊 Occupancy — {displayMonths.length === 1 ? `${MONTHS[displayMonths[0].month]} ${displayMonths[0].year}` : `${MONTHS[displayMonths[0].month]}–${MONTHS[displayMonths[displayMonths.length - 1].month]} ${displayMonths[displayMonths.length - 1].year}`}
              </h3>
              <div className={`grid gap-3 ${displayedProps.length <= 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"}`}>
                {occupancyStats.map(stat => (
                  <div key={stat.propId} className="card p-3">
                    <p className="text-xs text-gray-400 truncate">{stat.name}</p>
                    <p className="text-lg font-bold" style={{ color: "#0f3c52" }}>
                      {stat.booked}/{stat.total} <span className="text-xs font-normal text-gray-400">nights · {stat.pct}%</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ─── LIST VIEW ─── */}
        {viewMode === "list" && (() => {
          // Compute bookings/blocks across the full display range
          const rangeStart = displayMonths.length > 0 ? dateStr(displayMonths[0].year, displayMonths[0].month, 1) : monthStart;
          const lastMonth = displayMonths[displayMonths.length - 1];
          const rangeEndDays = lastMonth ? new Date(lastMonth.year, lastMonth.month + 1, 0).getDate() : daysInMonth;
          const rangeEnd = displayMonths.length > 0 ? dateStr(lastMonth!.year, lastMonth!.month, rangeEndDays) : monthEnd;

          const rangeBookings = bookings.filter(b =>
            (showCancelled || b.status !== "cancelled") && b.startDate <= rangeEnd && b.endDate >= rangeStart
          );
          const rangeBlocks = calendarBlocks.filter(b =>
            b.startDate <= rangeEnd && b.endDate >= rangeStart
          );

          return (
          <div className="card">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Upcoming Bookings &amp; Events</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {rangeBookings.sort((a, b) => a.startDate.localeCompare(b.startDate)).map((b) => {
                const prop = properties.find(p => p.id === b.propertyId);
                const isCancelled = b.status === "cancelled";
                return (
                  <div key={b.id} className={`px-6 py-3 flex items-center justify-between hover:bg-gray-50 ${isCancelled ? "opacity-70" : ""}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-2 h-2 rounded-full ${isCancelled ? "bg-red-300" : "bg-green-500"}`}></div>
                      <div>
                        <p className={`text-sm font-medium ${isCancelled ? "line-through text-gray-400" : ""}`}>{b.guestName}</p>
                        <p className="text-xs text-gray-500">{prop?.name} · {formatDate(b.startDate)} — {formatDate(b.endDate)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">{b.source}</span>
                      <span className={`text-sm font-medium ${isCancelled ? "line-through text-gray-400" : ""}`}>{formatCurrency(b.totalAmount)}</span>
                      <span className={`badge text-xs ${b.status === "confirmed" ? "bg-blue-100 text-blue-800" : b.status === "checked-in" ? "bg-green-100 text-green-800" : b.status === "checked-out" ? "bg-gray-100 text-gray-600" : "bg-red-100 text-red-800"}`}>{b.status}</span>
                    </div>
                  </div>
                );
              })}
              {rangeBlocks.map((cb) => {
                const prop = properties.find(p => p.id === cb.propertyId);
                return (
                  <div key={cb.id} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50">
                    <div className="flex items-center gap-4">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cb.color }}></div>
                      <div>
                        <p className="text-sm font-medium">{cb.title}</p>
                        <p className="text-xs text-gray-500">{prop?.name} · {formatDate(cb.startDate)} — {formatDate(cb.endDate)}</p>
                      </div>
                    </div>
                    <span className="text-xs capitalize text-gray-500">{cb.type}</span>
                  </div>
                );
              })}
              {rangeBookings.length === 0 && rangeBlocks.length === 0 && (
                <p className="px-6 py-8 text-center text-gray-400">No events in this range</p>
              )}
            </div>
          </div>
          );
        })()}

        {/* Debug Panel */}
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-semibold text-gray-700 select-none">🔧 Debug Panel</summary>
          <div className="mt-3 pt-3 border-t space-y-3 text-xs font-mono">
            <div className="grid grid-cols-4 gap-4">
              <div className="card p-3">
                <p className="text-gray-400 mb-1">Store Bookings</p>
                <p className="text-lg font-bold" style={{ color: "#0f3c52" }}>{bookings.length}</p>
                <p className="text-gray-400">useStore()</p>
              </div>
              <div className="card p-3">
                <p className="text-gray-400 mb-1">DB Bookings</p>
                <p className="text-lg font-bold" style={{ color: "#22c55e" }}>{lsBookings}</p>
                <p className="text-gray-400">Postgres</p>
              </div>
              <div className="card p-3">
                <p className="text-gray-400 mb-1">Hydration</p>
                <p className="text-lg font-bold" style={{ color: hydrationOk ? "#0f3c52" : "#ef4444" }}>{hydrationOk ? "✅ Hydrated" : "⚠️ Seed only"}</p>
                <p className="text-gray-400">12 seed + adds</p>
              </div>
              <div className="card p-3">
                <p className="text-gray-400 mb-1">Calendar Blocks</p>
                <p className="text-lg font-bold" style={{ color: "#0f3c52" }}>{calendarBlocks.length}</p>
                <p className="text-gray-400">useStore()</p>
              </div>
            </div>
            <div>
              <p className="text-gray-400 mb-2 font-medium">Store Bookings (last 5)</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left px-3 py-1">ID</th>
                      <th className="text-left px-3 py-1">Guest</th>
                      <th className="text-left px-3 py-1">Property</th>
                      <th className="text-left px-3 py-1">Dates</th>
                      <th className="text-left px-3 py-1">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {bookings.slice(-5).reverse().map(b => {
                      const prop = properties.find(p => p.id === b.propertyId);
                      return (
                        <tr key={b.id} className="hover:bg-gray-50">
                          <td className="px-3 py-1 text-gray-400">{b.id}</td>
                          <td className="px-3 py-1 font-medium">{b.guestName}</td>
                          <td className="px-3 py-1 text-gray-500">{prop?.name}</td>
                          <td className="px-3 py-1 text-gray-500">{formatDate(b.startDate)} → {formatDate(b.endDate)}</td>
                          <td className="px-3 py-1"><span className="badge bg-blue-100 text-blue-800 text-[10px]">{b.status}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </details>

        {/* ─── QUICK BOOK MODAL ─── */}
        {showQuickBook && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !quickBookSuccess && setShowQuickBook(false)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-sm">{quickBookSuccess ? "✅ Booked!" : "⚡ Quick Book"}</h3>
                <button onClick={() => setShowQuickBook(false)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
              </div>
              {quickBookSuccess ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-green-600 font-medium">{quickBookGuest || "Walk-in"} booked!</p>
                </div>
              ) : (
                <form onSubmit={submitQuickBook} className="p-4 space-y-3">
                  {quickBookError && (
                    <p className="text-xs bg-red-50 text-red-700 p-2 rounded border border-red-200">{quickBookError}</p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Check-in</label>
                      <input type="date" className="input-field text-xs" value={quickBookCheckIn} onChange={e => setQuickBookCheckIn(e.target.value)} required />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Check-out</label>
                      <input type="date" className="input-field text-xs" value={quickBookCheckOut} onChange={e => setQuickBookCheckOut(e.target.value)} min={quickBookCheckIn || undefined} required />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Property</label>
                    <select className="input-field text-xs" value={quickBookProp} onChange={e => setQuickBookProp(e.target.value)} required>
                      <option value="">Select property...</option>
                      {properties.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Guest Name</label>
                    <input className="input-field text-xs" value={quickBookGuest} onChange={e => setQuickBookGuest(e.target.value)} placeholder="Guest name" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                    <input className="input-field text-xs" type="email" value={quickBookEmail} onChange={e => setQuickBookEmail(e.target.value)} placeholder="guest@email.com" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                    <input className="input-field text-xs" type="tel" value={quickBookPhone} onChange={e => setQuickBookPhone(e.target.value)} placeholder="(555) 000-0000" />
                  </div>
                  <button type="submit" className="btn-accent w-full text-sm">Confirm Quick Book</button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* ─── FULL BOOKING MODAL (kept as-is) ─── */}
        {showNewBooking && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !bookingSuccess && setShowNewBooking(false)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {bookingSuccess ? "Booking Confirmed!" : bookStep === "dates" ? "New Booking — Select Dates" : bookStep === "results" ? "Available Properties" : "Guest Information"}
                </h2>
                <button onClick={() => setShowNewBooking(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>
              {bookingSuccess ? (
                <div className="px-6 py-12 text-center"><div className="text-4xl mb-3">✅</div><p className="text-lg font-medium text-green-600">Booking created!</p><p className="text-sm text-gray-500 mt-1">{bookGuestName} · {bookCheckIn} → {bookCheckOut}</p></div>
              ) : bookStep === "dates" ? (
                <form onSubmit={handleBookSearch} className="p-6 space-y-4">
                  <p className="text-sm text-gray-500">Select dates to find available properties.</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Check-in</label><input type="date" className="input-field" value={bookCheckIn} onChange={e => setBookCheckIn(e.target.value)} min={new Date().toISOString().slice(0, 10)} required /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Check-out</label><input type="date" className="input-field" value={bookCheckOut} onChange={e => setBookCheckOut(e.target.value)} min={bookCheckIn || new Date().toISOString().slice(0, 10)} required /></div>
                  </div>
                  <button type="submit" className="btn-accent w-full">Search Availability</button>
                </form>
              ) : bookStep === "results" ? (
                <div className="p-6">
                  <div className="mb-3 p-2 bg-blue-50 rounded-lg text-sm text-blue-700">{bookCheckIn} → {bookCheckOut} · {bookNights} nights</div>
                  {availableForBook.length > 0 ? (
                    <div className="space-y-2">
                      {availableForBook.map(p => {
                        const rate = p.nightlyRate || p.monthlyRent / 30;
                        const fees = calculateFees(bookNights, rate);
                        return (
                          <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                            <div><p className="text-sm font-semibold">{p.name}</p><p className="text-xs text-gray-500">{formatCurrency(rate)}/night · {formatCurrency(fees.total)} total</p></div>
                            <button onClick={() => handleSelectProp(p.id)} className="btn-accent text-xs">Book Now</button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8"><p className="text-gray-400">No properties available.</p><button onClick={() => setBookStep("dates")} className="mt-2 text-sm text-blue-600 hover:underline">Try different dates</button></div>
                  )}
                  <button onClick={() => setBookStep("dates")} className="mt-3 text-sm text-gray-400 hover:underline">← Back to dates</button>
                </div>
              ) : bookStep === "guest" ? (
                <form onSubmit={handleBookSubmit} className="p-6 space-y-4">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm font-semibold">{bookProp?.name}</p>
                    <p className="text-xs text-gray-500">{bookCheckIn} → {bookCheckOut} · {bookNights} nights</p>
                    <div className="mt-2 pt-2 border-t space-y-1 text-xs">
                      <div className="flex justify-between items-center"><span className="text-gray-500">Nightly $</span><input type="number" className="w-20 text-right text-xs border rounded px-1 py-0.5" value={bookNightlyRate || bookRate} onChange={e => setBookNightlyRate(Number(e.target.value))} min={0} /></div>
                      <div className="flex justify-between"><span className="text-gray-500">{bookNights}n × {formatCurrency(bookNightlyRate || bookRate)}</span><span>{formatCurrency(bookSubtotal)}</span></div>
                      <div className="flex justify-between items-center"><span className="text-gray-500">Cleaning $</span><input type="number" className="w-20 text-right text-xs border rounded px-1 py-0.5" value={bookCleanFee} onChange={e => setBookCleanFee(Number(e.target.value))} min={0} /></div>
                      <div className="flex justify-between items-center"><span className="text-gray-500">Linen $</span><input type="number" className="w-20 text-right text-xs border rounded px-1 py-0.5" value={bookLinenFeeState} onChange={e => setBookLinenFeeState(Number(e.target.value))} min={0} /></div>
                      <div className="flex justify-between items-center"><span className="text-gray-500">Comm %</span><input type="number" className="w-20 text-right text-xs border rounded px-1 py-0.5" value={bookCommRate} onChange={e => setBookCommRate(Number(e.target.value))} min={0} max={50} step={0.5} /></div>
                      <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>{bookNights >= 185 ? "Exempt" : formatCurrency(bookTaxAmount)}</span></div>
                      <div className="flex justify-between font-bold pt-1 border-t"><span>Total</span><span>{formatCurrency(bookTotal)}</span></div>
                    </div>
                  </div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Guest Name</label><input className="input-field" value={bookGuestName} onChange={e => setBookGuestName(e.target.value)} placeholder="Enter guest name" required /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Guest Email</label><input className="input-field" type="email" value={bookGuestEmail} onChange={e => setBookGuestEmail(e.target.value)} placeholder="guest@email.com" required /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Phone</label><input className="input-field" type="tel" value={bookGuestPhone} onChange={e => setBookGuestPhone(e.target.value)} placeholder="(555) 000-0000" /></div>
                  {bookError && <p className="text-sm text-red-600 font-medium">{bookError}</p>}
                  <div className="flex justify-end gap-3 pt-2"><button type="button" className="btn-secondary" onClick={() => setBookStep("results")}>← Back</button><button type="submit" className="btn-accent">Confirm Booking</button></div>
                </form>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
