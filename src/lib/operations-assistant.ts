/**
 * RentVue — Operations Assistant
 * Scans the entire system and surfaces what needs attention.
 * No external API — keyword/rule-based pattern matching.
 */

import type { StoreState } from "./shared-store";
import { formatCurrency, formatDate } from "./data";

// ─── Types ───

export type InsightSeverity = "urgent" | "watch" | "opportunity";

export interface Insight {
  id: string;
  severity: InsightSeverity;
  title: string;
  description: string;
  actionLabel: string;
  actionRoute: string;
}

export interface ScanResult {
  urgent: Insight[];
  watch: Insight[];
  opportunities: Insight[];
}

// ─── Helpers ───

const MS_HOUR = 3600000;
const MS_DAY = 86400000;
const now = () => new Date();
const today = () => now().toISOString().slice(0, 10);
const daysAgo = (dateStr: string): number => {
  const d = new Date(dateStr + "T00:00:00");
  return Math.floor((now().getTime() - d.getTime()) / MS_DAY);
};
const daysFromNow = (dateStr: string): number => {
  const d = new Date(dateStr + "T00:00:00");
  return Math.floor((d.getTime() - now().getTime()) / MS_DAY);
};
const hoursAgo = (isoStr: string): number => {
  if (!isoStr) return Infinity;
  const d = new Date(isoStr);
  return (now().getTime() - d.getTime()) / MS_HOUR;
};

// ─── Main Scanner ───

export function scanOperations(store: StoreState): ScanResult {
  const urgent: Insight[] = [];
  const watch: Insight[] = [];
  const opportunities: Insight[] = [];

  const todayStr = today();

  // ═══════════════════════════════════════
  // URGENT DETECTORS
  // ═══════════════════════════════════════

  // 1. Maintenance open >24h with no vendor accepted
  for (const m of store.maintenanceRequests) {
    if ((m.status === "open" || m.status === "in-progress") && !m.vendorAccepted) {
      const ageHours = hoursAgo(m.dateReported + "T12:00:00Z");
      if (ageHours > 24) {
        const prop = store.properties.find(p => p.id === m.propertyId);
        urgent.push({
          id: `urg-m-${m.id}`,
          severity: "urgent",
          title: `Maintenance unassigned: ${m.description.slice(0, 30)}`,
          description: `${prop?.name || m.propertyId}: ${m.description}. Reported ${daysAgo(m.dateReported)}d ago — no vendor accepted (${Math.round(ageHours / 24)}d). Priority: ${m.priority}.`,
          actionLabel: "Assign Vendor",
          actionRoute: `/maintenance`,
        });
      }
    }
  }

  // 2. Bookings checking in today with unsigned documents
  for (const b of store.bookings) {
    if (b.status === "cancelled") continue;
    if (b.startDate === todayStr) {
      const docs = store.signedDocuments.filter(
        d => d.bookingId === b.id && (d.status === "sent" || d.status === "viewed" || d.status === "draft")
      );
      if (docs.length > 0) {
        urgent.push({
          id: `urg-doc-${b.id}`,
          severity: "urgent",
          title: `Unsigned docs for today's check-in: ${b.guestName}`,
          description: `${b.guestName} checks in today (Res #${b.reservationNumber}). ${docs.length} document(s) still need signing: ${docs.map(d => d.title).join(", ")}.`,
          actionLabel: "View Booking",
          actionRoute: `/bookings/${b.id}`,
        });
      }
    }
  }

  // 3. Guest messages classified as "complaint" with no reply
  for (const gm of store.guestMessages) {
    if (gm.category === "complaint" && gm.status === "new") {
      urgent.push({
        id: `urg-gm-${gm.id}`,
        severity: "urgent",
        title: `Unanswered complaint: ${gm.guestName}`,
        description: `${gm.guestName}: "${gm.subject}". Received ${daysAgo(gm.createdAt.slice(0, 10))}d ago — no reply sent.`,
        actionLabel: "Reply Now",
        actionRoute: `/guest/${gm.bookingId || ""}`,
      });
    }
  }

  // 4. Turnovers not confirmed for today's check-ins
  for (const b of store.bookings) {
    if (b.status === "cancelled") continue;
    if (b.startDate === todayStr) {
      const prop = store.properties.find(p => p.id === b.propertyId);
      // Check if there was a checkout yesterday or today at this property
      const prevCheckout = store.bookings.find(
        pb => pb.propertyId === b.propertyId && pb.id !== b.id &&
          (pb.endDate === todayStr || pb.endDate === new Date(now().getTime() - MS_DAY).toISOString().slice(0, 10)) &&
          pb.status !== "cancelled"
      );
      if (prevCheckout) {
        urgent.push({
          id: `urg-turnover-${b.id}`,
          severity: "urgent",
          title: `Turnover needed: ${prop?.name || b.propertyId} → ${b.guestName}`,
          description: `${prevCheckout.guestName} checked out ${prevCheckout.endDate === todayStr ? "today" : "yesterday"}. ${b.guestName} checks in today. Confirm turnover is complete.`,
          actionLabel: "Check Housekeeping",
          actionRoute: `/housekeeping`,
        });
      }
    }
  }

  // ═══════════════════════════════════════
  // WATCH DETECTORS
  // ═══════════════════════════════════════

  // 1. Properties vacant >7 days
  for (const p of store.properties) {
    if (p.status === "vacant") {
      // For short-term, check when the last booking ended
      const lastBooking = store.bookings
        .filter(b => b.propertyId === p.id && b.status !== "cancelled")
        .sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
      if (lastBooking) {
        const vacantDays = daysAgo(lastBooking.endDate);
        if (vacantDays > 7) {
          watch.push({
            id: `watch-vac-${p.id}`,
            severity: "watch",
            title: `Vacant: ${p.name} (${vacantDays}d)`,
            description: `${p.name} has been vacant since ${formatDate(lastBooking.endDate)} (${vacantDays} days). Last booking: ${lastBooking.guestName}. Lost revenue: ~${formatCurrency(vacantDays * (p.nightlyRate || Math.round(p.monthlyRent / 30)))}.`,
            actionLabel: "View Property",
            actionRoute: `/properties`,
          });
        }
      }
    }
  }

  // 2. Current month occupancy vs same month last year (approximate)
  const thisMonth = now().getMonth(); // 0-indexed
  const thisYear = now().getFullYear();
  const monthStart = `${thisYear}-${String(thisMonth + 1).padStart(2, "0")}-01`;
  const monthEnd = `${thisYear}-${String(thisMonth + 1).padStart(2, "0")}-31`;
  // Count booked nights this month
  const stProps = store.properties.filter(p => p.type === "short-term");
  for (const p of stProps) {
    const monthBookings = store.bookings.filter(
      b => b.propertyId === p.id && b.status !== "cancelled" &&
        b.startDate <= monthEnd && b.endDate >= monthStart
    );
    const bookedNights = monthBookings.reduce((sum, b) => {
      const overlapStart = b.startDate > monthStart ? b.startDate : monthStart;
      const overlapEnd = b.endDate < monthEnd ? b.endDate : monthEnd;
      const nights = Math.max(0, Math.ceil((new Date(overlapEnd).getTime() - new Date(overlapStart).getTime()) / MS_DAY));
      return sum + nights;
    }, 0);
    const daysInMonth = new Date(thisYear, thisMonth + 1, 0).getDate();
    const occupancyPct = Math.round((bookedNights / daysInMonth) * 100);

    if (occupancyPct < 50 && monthBookings.length > 0) {
      watch.push({
        id: `watch-occ-${p.id}`,
        severity: "watch",
        title: `Low occupancy: ${p.name} (${occupancyPct}%)`,
        description: `${p.name} is at ${occupancyPct}% occupancy this month (${bookedNights}/${daysInMonth} nights booked across ${monthBookings.length} booking(s)). Under 50% may need attention.`,
        actionLabel: "View Calendar",
        actionRoute: `/calendar`,
      });
    }
  }

  // 3. Documents sent/viewed but not signed >48h
  for (const doc of store.signedDocuments) {
    if ((doc.status === "sent" || doc.status === "viewed") && doc.sentAt) {
      const hrs = hoursAgo(doc.sentAt);
      if (hrs > 48) {
        watch.push({
          id: `watch-doc-${doc.id}`,
          severity: "watch",
          title: `Unsigned: ${doc.title}`,
          description: `"${doc.title}" sent to ${doc.sentToName} (${doc.sentTo}) ${Math.round(hrs / 24)}d ago — still not signed.${doc.status === "viewed" ? " They have viewed it but not signed." : ""}`,
          actionLabel: "View Document",
          actionRoute: `/documents`,
        });
      }
    }
  }

  // 4. Maintenance open >7 days
  for (const m of store.maintenanceRequests) {
    if ((m.status === "open" || m.status === "in-progress") && daysAgo(m.dateReported) > 7) {
      const prop = store.properties.find(p => p.id === m.propertyId);
      watch.push({
        id: `watch-maint-${m.id}`,
        severity: "watch",
        title: `Aging maintenance: ${m.description.slice(0, 30)}`,
        description: `${prop?.name || m.propertyId}: Open for ${daysAgo(m.dateReported)}d (since ${formatDate(m.dateReported)}). Priority: ${m.priority}. Assigned to: ${m.assignedTo || "nobody"}.`,
        actionLabel: "View Maintenance",
        actionRoute: `/maintenance`,
      });
    }
  }

  // 5. Owner statements pending (documents in "draft" or "sent")
  for (const doc of store.signedDocuments) {
    if (doc.status === "draft" || doc.status === "sent") {
      // Check if it's owner-related
      if (doc.ownerId) {
        const owner = store.owners.find(o => o.id === doc.ownerId);
        watch.push({
          id: `watch-owner-${doc.id}`,
          severity: "watch",
          title: `Pending owner doc: ${doc.title}`,
          description: `"${doc.title}" for ${owner?.name || doc.ownerId} is still ${doc.status}. ${doc.sentAt ? `Sent ${Math.round(hoursAgo(doc.sentAt) / 24)}d ago.` : "Not yet sent."}`,
          actionLabel: "View Documents",
          actionRoute: `/documents`,
        });
      }
    }
  }

  // ═══════════════════════════════════════
  // OPPORTUNITIES DETECTORS
  // ═══════════════════════════════════════

  // 1. 2+ night gaps between bookings within next 30 days → suggest discount
  const thirtyDaysOut = new Date(now().getTime() + 30 * MS_DAY).toISOString().slice(0, 10);
  for (const p of store.properties) {
    if (p.type !== "short-term") continue;
    const upcoming = store.bookings
      .filter(b => b.propertyId === p.id && b.status !== "cancelled" && b.startDate <= thirtyDaysOut && b.endDate >= todayStr)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));

    for (let i = 0; i < upcoming.length - 1; i++) {
      const gapDays = Math.ceil(
        (new Date(upcoming[i + 1].startDate).getTime() - new Date(upcoming[i].endDate).getTime()) / MS_DAY
      );
      if (gapDays >= 2 && gapDays <= 30) {
        const gapRevenue = gapDays * (p.nightlyRate || Math.round(p.monthlyRent / 30));
        opportunities.push({
          id: `opp-gap-${p.id}-${i}`,
          severity: "opportunity",
          title: `${gapDays}-night gap in ${p.name}`,
          description: `${gapDays} unbooked nights between ${formatDate(upcoming[i].endDate)} and ${formatDate(upcoming[i + 1].startDate)}. Potential revenue: ~${formatCurrency(gapRevenue)}. Consider a discount or promo.`,
          actionLabel: "Create Promo",
          actionRoute: `/calendar`,
        });
      }
    }
  }

  // 2. Return guest detection (guest email matches previous booking)
  const guestEmails = new Map<string, { name: string; count: number; lastId: string }>();
  for (const b of store.bookings) {
    if (b.status === "cancelled") continue;
    const existing = guestEmails.get(b.guestEmail);
    if (existing) {
      existing.count++;
      if (b.startDate > (store.bookings.find(x => x.id === existing.lastId)?.startDate || "")) {
        existing.lastId = b.id;
      }
    } else {
      guestEmails.set(b.guestEmail, { name: b.guestName, count: 1, lastId: b.id });
    }
  }
  for (const [email, info] of guestEmails) {
    if (info.count >= 2) {
      const lastBooking = store.bookings.find(b => b.id === info.lastId);
      if (lastBooking && lastBooking.status !== "checked-out") continue; // only past guests
      opportunities.push({
        id: `opp-return-${email.replace(/[^a-z0-9]/g, "")}`,
        severity: "opportunity",
        title: `Return guest: ${info.name} (${info.count} stays)`,
        description: `${info.name} has booked ${info.count} times. Last stay: ${lastBooking ? formatDate(lastBooking.startDate) : "unknown"}. Consider sending a loyalty offer or early-bird discount for their next trip.`,
        actionLabel: "Send Offer",
        actionRoute: lastBooking ? `/bookings/${lastBooking.id}` : "/tenants",
      });
    }
  }

  // 3. Long-term tenants with lease ending within 60 days
  for (const t of store.tenants) {
    if (t.type !== "tenant" || !t.leaseEnd) continue;
    const daysLeft = daysFromNow(t.leaseEnd);
    if (daysLeft > 0 && daysLeft <= 60) {
      const prop = store.properties.find(p => p.id === t.propertyId);
      opportunities.push({
        id: `opp-lease-${t.id}`,
        severity: "opportunity",
        title: `Lease ending: ${t.name} (${daysLeft}d)`,
        description: `${t.name}'s lease at ${prop?.name || t.propertyId} ends in ${daysLeft} days (${formatDate(t.leaseEnd)}). Reach out about renewal or start marketing the unit. Current rent: ${formatCurrency(t.rentAmount || 0)}/mo.`,
        actionLabel: "Contact Tenant",
        actionRoute: `/tenants`,
      });
    }
  }

  // 4. Properties with zero open maintenance → upsell premium service
  for (const p of store.properties) {
    const openMaint = store.maintenanceRequests.filter(
      m => m.propertyId === p.id && (m.status === "open" || m.status === "in-progress")
    );
    if (openMaint.length === 0 && p.status === "occupied") {
      opportunities.push({
        id: `opp-premium-${p.id}`,
        severity: "opportunity",
        title: `Well-maintained: ${p.name}`,
        description: `${p.name} has no open maintenance requests and is performing well. This is a good time to upsell premium services: seasonal deep clean, preventative HVAC service, or landscape refresh.`,
        actionLabel: "View Property",
        actionRoute: `/properties`,
      });
    }
  }

  return { urgent, watch, opportunities };
}

// ─── Natural Language Query Parser ───

export function parseAssistantQuery(query: string, store: StoreState): string {
  const q = query.toLowerCase().trim();
  const scan = scanOperations(store);
  const todayStr = today();

  // Reservation number lookup (4-digit exact match)
  const resMatch = q.match(/\b(\d{4})\b/);
  if (resMatch) {
    const resNum = resMatch[1];
    const booking = store.bookings.find(b => b.reservationNumber === resNum);
    if (booking) {
      const prop = store.properties.find(p => p.id === booking.propertyId);
      return `🔍 **Reservation #${resNum}** — ${booking.guestName} · ${prop?.name || booking.propertyId}\n📅 ${booking.startDate} → ${booking.endDate} · ${booking.status}\n💰 ${formatCurrency(booking.totalAmount)} · ${booking.source}\n\n[View booking details](/bookings/${booking.id})`;
    }
    return `❌ No reservation found with number #${resNum}.`;
  }

  // "What needs my attention?"
  if (/what needs my attention|attention needed|what's up|overview|summary|status/i.test(q)) {
    const parts: string[] = [];
    if (scan.urgent.length > 0) parts.push(`🔴 **${scan.urgent.length} urgent** items need attention now.`);
    else parts.push("🔴 **No urgent items** — great job!");
    if (scan.watch.length > 0) parts.push(`🟡 **${scan.watch.length} items** to keep an eye on.`);
    else parts.push("🟡 **Nothing on watch** — everything's under control.");
    if (scan.opportunities.length > 0) parts.push(`🟢 **${scan.opportunities.length} opportunities** to grow revenue or improve operations.`);
    else parts.push("🟢 **No opportunities** detected right now.");
    return parts.join("\n\n");
  }

  // "How's July occupancy?" / month occupancy
  const monthMatch = q.match(/(january|february|march|april|may|june|july|august|september|october|november|december)/i);
  if (monthMatch && /occupancy|booked|how.*(?:is|are|looking)/i.test(q)) {
    const monthNames = ["january","february","march","april","may","june","july","august","september","october","november","december"];
    const monthIdx = monthNames.indexOf(monthMatch[1].toLowerCase());
    const monthStart = `2026-${String(monthIdx + 1).padStart(2, "0")}-01`;
    const daysInMonth = new Date(2026, monthIdx + 1, 0).getDate();
    const monthEnd = `2026-${String(monthIdx + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

    const lines: string[] = [`📊 **${monthMatch[1].charAt(0).toUpperCase() + monthMatch[1].slice(1)} 2026 Occupancy:**\n`];
    for (const p of store.properties.filter(x => x.type === "short-term")) {
      const monthBookings = store.bookings.filter(
        b => b.propertyId === p.id && b.status !== "cancelled" && b.startDate <= monthEnd && b.endDate >= monthStart
      );
      const bookedNights = monthBookings.reduce((sum, b) => {
        const overlapStart = b.startDate > monthStart ? b.startDate : monthStart;
        const overlapEnd = b.endDate < monthEnd ? b.endDate : monthEnd;
        return sum + Math.max(0, Math.ceil((new Date(overlapEnd).getTime() - new Date(overlapStart).getTime()) / MS_DAY));
      }, 0);
      const pct = Math.round((bookedNights / daysInMonth) * 100);
      const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
      lines.push(`- **${p.name}**: ${bar} ${pct}% (${bookedNights}/${daysInMonth} nights, ${monthBookings.length} bookings)`);
    }
    return lines.join("\n");
  }

  // "Show vacant properties"
  if (/vacant|empty|unoccupied/i.test(q)) {
    const vacant = store.properties.filter(p => p.status === "vacant");
    if (vacant.length === 0) return "✅ All properties are currently occupied.";
    return `🏠 **${vacant.length} vacant properties:**\n` +
      vacant.map(p => {
        const lastBooking = store.bookings.filter(b => b.propertyId === p.id && b.status !== "cancelled").sort((a,b) => b.endDate.localeCompare(a.endDate))[0];
        const vDays = lastBooking ? daysAgo(lastBooking.endDate) : "?";
        return `- **${p.name}** (${p.type}) — vacant ${vDays}d · ${formatCurrency(p.nightlyRate || Math.round(p.monthlyRent / 30))}/night`;
      }).join("\n");
  }

  // "Overdue maintenance?"
  if (/overdue|aging|old.*maintenance|maintenance.*old/i.test(q)) {
    const aging = store.maintenanceRequests.filter(
      m => (m.status === "open" || m.status === "in-progress") && daysAgo(m.dateReported) > 7
    );
    if (aging.length === 0) return "✅ No overdue maintenance — all tickets are under 7 days old.";
    return `🔧 **${aging.length} aging maintenance tickets:**\n` +
      aging.map(m => {
        const prop = store.properties.find(p => p.id === m.propertyId);
        return `- **${m.description.slice(0, 40)}** at ${prop?.name || m.propertyId} — ${daysAgo(m.dateReported)}d old, ${m.priority} priority`;
      }).join("\n");
  }

  // "Who hasn't signed?"
  if (/sign|signed|document|doc/i.test(q) && /not|hasn't|un|pending|outstanding/i.test(q)) {
    const unsigned = store.signedDocuments.filter(
      d => d.status === "sent" || d.status === "viewed" || d.status === "draft"
    );
    if (unsigned.length === 0) return "✅ All documents are signed and executed.";
    return `📄 **${unsigned.length} unsigned/outstanding documents:**\n` +
      unsigned.map(d => {
        const hrs = d.sentAt ? Math.round(hoursAgo(d.sentAt) / 24) : null;
        return `- **${d.title}** — ${d.sentToName} (${d.status})${hrs !== null ? ` · ${hrs}d since sent` : ""}`;
      }).join("\n");
  }

  // "Show check-ins today" / "arrivals"
  if (/check.?in|arrival|arriving/i.test(q)) {
    const arrivals = store.bookings.filter(b => b.startDate === todayStr && b.status !== "cancelled");
    if (arrivals.length === 0) return `🛬 No check-ins scheduled for today (${formatDate(todayStr)}).`;
    return `🛬 **${arrivals.length} check-in(s) today (${formatDate(todayStr)}):**\n` +
      arrivals.map(b => {
        const prop = store.properties.find(p => p.id === b.propertyId);
        const docs = store.signedDocuments.filter(d => d.bookingId === b.id && (d.status === "sent" || d.status === "viewed" || d.status === "draft"));
        return `- **${b.guestName}** → ${prop?.name || b.propertyId} (Res #${b.reservationNumber})${docs.length > 0 ? " ⚠️ Unsigned docs" : " ✅"}`;
      }).join("\n");
  }

  // "Show check-outs today"
  if (/check.?out|departure|departing/i.test(q)) {
    const departures = store.bookings.filter(b => b.endDate === todayStr && b.status !== "cancelled");
    if (departures.length === 0) return `🛫 No check-outs scheduled for today (${formatDate(todayStr)}).`;
    return `🛫 **${departures.length} check-out(s) today (${formatDate(todayStr)}):**\n` +
      departures.map(b => {
        const prop = store.properties.find(p => p.id === b.propertyId);
        const nextArrival = store.bookings.find(nb => nb.propertyId === b.propertyId && nb.startDate === todayStr && nb.status !== "cancelled");
        return `- **${b.guestName}** ← ${prop?.name || b.propertyId}${nextArrival ? " ⚡ Turnover needed" : ""}`;
      }).join("\n");
  }

  // "Show opportunities" / "revenue opportunities"
  if (/opportunit|revenue|grow|upsell|offer/i.test(q)) {
    if (scan.opportunities.length === 0) return "🟢 No new opportunities detected right now. Check back after the next scan.";
    return `🟢 **${scan.opportunities.length} opportunities:**\n` +
      scan.opportunities.map(o => `- **${o.title}**: ${o.description}`).join("\n\n");
  }

  // "Upcoming bookings"
  if (/upcoming|future.*booking|next.*booking|booking.*coming/i.test(q)) {
    const upcoming = store.bookings.filter(b => b.startDate > todayStr && b.status !== "cancelled").sort((a,b) => a.startDate.localeCompare(b.startDate));
    if (upcoming.length === 0) return "No upcoming bookings found.";
    const next5 = upcoming.slice(0, 10);
    return `📅 **${upcoming.length} upcoming booking(s). Next ${Math.min(10, upcoming.length)}:**\n` +
      next5.map(b => {
        const prop = store.properties.find(p => p.id === b.propertyId);
        return `- **${formatDate(b.startDate)}**: ${b.guestName} → ${prop?.name || b.propertyId} (${b.source})`;
      }).join("\n");
  }

  // "How many properties?"
  if (/how many prop|property count|total prop|number of prop/i.test(q)) {
    const occ = store.properties.filter(p => p.status === "occupied").length;
    return `🏠 **${store.properties.length} total properties**: ${occ} occupied, ${store.properties.length - occ} vacant. ` +
      `${store.properties.filter(p => p.type === "short-term").length} short-term, ${store.properties.filter(p => p.type === "long-term").length} long-term.`;
  }

  // "How do I pay an owner?" / "owner payout" / "pay out"
  if (/payout|pay.*owner|owner.*pay|payment.*owner|owner.*payment|how.*do.*i.*pay/i.test(q)) {
    return `💰 **Owner Payouts**\n\n` +
      `RentVue calculates owner payouts automatically based on bookings:\n\n` +
      `**Short-term rentals:**\n` +
      `- Booking total − cleaning fee − linen fee − commission = **owner payout**\n` +
      `- Commission rate is configurable per booking (typically 15-25%)\n\n` +
      `**Long-term rentals:**\n` +
      `- Monthly rent − management fee = **owner payout**\n\n` +
      `**To process payouts:**\n` +
      `1. Go to [Accounting](/accounting) to see completed bookings and calculated payouts\n` +
      `2. Payouts are tracked per booking — when a guest checks out, the owner's share is ready\n` +
      `3. You can run owner payout reports by property to see what each owner is owed\n\n` +
      `Need a detailed report? Ask "show me owner payouts for [property name]."`;
  }

  // "Show me owner payouts for [property]"
  if (/owner.*(?:payout|owed|earning|revenue)|(?:payout|owed).*owner/i.test(q)) {
    const propName = q.match(/for\s+(.+?)(?:\s*\?|\s*$)/i)?.[1];
    const targetProps = propName
      ? store.properties.filter(p => p.name.toLowerCase().includes(propName.toLowerCase()))
      : store.properties;

    if (targetProps.length === 0) return `No property found matching "${propName}".`;

    const lines: string[] = [];
    for (const p of targetProps.slice(0, 10)) {
      const completed = store.bookings.filter(
        b => b.propertyId === p.id && (b.status === "checked-out" || b.status === "confirmed")
      );
      const total = completed.reduce((sum, b) => sum + b.totalAmount, 0);
      const owner = store.owners.find(o => o.id === p.ownerId);
      if (completed.length > 0) {
        lines.push(`- **${p.name}** (${owner?.name || "unknown owner"}): ${completed.length} booking(s) · ${formatCurrency(total)} total`);
      }
    }
    if (lines.length === 0) return "No completed bookings with payouts pending.";
    return `💰 **Owner Payouts by Property:**\n\n` + lines.join("\n") + `\n\n_Payouts are calculated as booking total minus fees and commission. See [Accounting](/accounting) for details._`;
  }

  // Default: run the full scan summary
  return `I scanned your operations. Here's what I found:\n\n` +
    (scan.urgent.length > 0
      ? `🔴 **${scan.urgent.length} urgent items:**\n${scan.urgent.map(u => `- ${u.title}`).join("\n")}\n\n`
      : "🔴 No urgent items.\n\n") +
    (scan.watch.length > 0
      ? `🟡 **${scan.watch.length} items to watch:**\n${scan.watch.map(w => `- ${w.title}`).join("\n")}\n\n`
      : "🟡 Nothing on watch.\n\n") +
    (scan.opportunities.length > 0
      ? `🟢 **${scan.opportunities.length} opportunities:**\n${scan.opportunities.map(o => `- ${o.title}`).join("\n")}`
      : "🟢 No new opportunities.");
}
