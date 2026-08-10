/**
 * RentVue — AI-powered guest message triage (keyword-based classifier).
 * No external API needed — works offline with pattern matching.
 */

export type MessageCategory = "maintenance" | "billing" | "complaint" | "question";
export type TriagePriority = "low" | "medium" | "high" | "urgent";
export type MaintenanceCategory = "plumbing" | "appliance" | "hvac" | "electrical" | "structural" | "general";

export interface ClassificationResult {
  category: MessageCategory;
  confidence: number; // 0–1
  details: string;
  suggestedPriority: TriagePriority;
  maintenanceCategory?: MaintenanceCategory;
}

// ─── Keyword dictionaries ───

const MAINTENANCE_KEYWORDS: [string[], MaintenanceCategory, TriagePriority][] = [
  // Plumbing
  [["leak", "leaking", "leaky", "faucet", "toilet", "drain", "clog", "clogged",
    "pipe", "plumbing", "water heater", "water pressure", "shower", "sink",
    "bathtub", "flood", "flooding", "dripping", "running toilet"], "plumbing", "high"],
  // Appliance
  [["dishwasher", "fridge", "refrigerator", "oven", "stove", "microwave",
    "washer", "dryer", "disposal", "garbage disposal", "appliance",
    "ice maker", "freezer"], "appliance", "medium"],
  // HVAC
  [["ac", "air conditioner", "air conditioning", "heater", "heating",
    "cooling", "thermostat", "hvac", "furnace", "heat pump",
    "no heat", "no ac", "no cooling", "hot", "too hot", "too cold",
    "temperature"], "hvac", "urgent"],
  // Electrical
  [["light", "lights", "outlet", "power", "breaker", "electrical",
    "wiring", "switch", "fuse", "spark", "sparking", "shock",
    "no power", "power outage", "tripped"], "electrical", "high"],
  // Structural
  [["window", "door", "wall", "floor", "ceiling", "roof", "lock",
    "broken glass", "crack", "cracked", "hole", "stuck",
    "won't open", "won't close", "wont open", "wont close",
    "key", "deadbolt", "hinge"], "structural", "medium"],
  // General maintenance (catch-all)
  [["broken", "not working", "doesn't work", "repair", "fix",
    "maintenance", "issue", "problem", "smoke", "alarm",
    "detector", "pest", "bug", "ants", "mice", "rodent",
    "mold", "smell", "odor", "stain"], "general", "medium"],
];

const BILLING_KEYWORDS = [
  "bill", "billing", "charge", "charged", "overcharge", "overcharged",
  "payment", "pay", "refund", "deposit", "fee", "fees",
  "invoice", "receipt", "cost", "price", "pricing",
  "credit card", "statement", "transaction", "amount",
  "discount", "promo", "coupon",
];

const COMPLAINT_KEYWORDS = [
  "unhappy", "noise", "noisy", "dirty", "filthy", "rude",
  "complaint", "terrible", "awful", "horrible", "disgusting",
  "unacceptable", "disappointed", "disappointing", "worst",
  "never again", "not stay", "demand", "compensation",
  "manager", "supervisor", "corporate",
];

const URGENCY_KEYWORDS: [string[], TriagePriority][] = [
  [["emergency", "urgent", "asap", "immediately", "right now",
    "flood", "flooding", "fire", "smoke", "gas", "leaking gas",
    "no heat", "no ac", "no power", "lockout", "locked out",
    "can't get in", "cant get in"], "urgent"],
  [["broken", "not working", "doesn't work", "no hot water",
    "no water", "sewage", "backup", "backed up"], "high"],
];

// ─── Classifier ───

export function classifyMessage(
  subject: string,
  message: string,
  _guestName?: string,
): ClassificationResult {
  const text = `${subject} ${message}`.toLowerCase();

  // Check maintenance keywords
  let bestMaintenance: { category: MaintenanceCategory; priority: TriagePriority; matches: number } | null = null;

  for (const [keywords, cat, pri] of MAINTENANCE_KEYWORDS) {
    const matches = keywords.filter(kw => text.includes(kw)).length;
    if (matches > 0 && (!bestMaintenance || matches > bestMaintenance.matches)) {
      bestMaintenance = { category: cat, priority: pri, matches };
    }
  }

  if (bestMaintenance && bestMaintenance.matches >= 1) {
    const confidence = Math.min(0.6 + bestMaintenance.matches * 0.15, 0.95);
    // Urgency keywords can upgrade priority
    let finalPriority = bestMaintenance.priority;
    for (const [urgentKws, urg] of URGENCY_KEYWORDS) {
      if (urgentKws.some(kw => text.includes(kw)) && priorityRank(urg) > priorityRank(finalPriority)) {
        finalPriority = urg;
      }
    }
    return {
      category: "maintenance",
      confidence,
      details: bestMaintenance.category,
      suggestedPriority: finalPriority,
      maintenanceCategory: bestMaintenance.category,
    };
  }

  // Check billing
  const billingMatches = BILLING_KEYWORDS.filter(kw => text.includes(kw)).length;
  if (billingMatches >= 1) {
    return {
      category: "billing",
      confidence: Math.min(0.5 + billingMatches * 0.2, 0.9),
      details: billingMatches > 1 ? "Multiple billing concerns" : "Billing inquiry",
      suggestedPriority: "medium",
    };
  }

  // Check complaint
  const complaintMatches = COMPLAINT_KEYWORDS.filter(kw => text.includes(kw)).length;
  if (complaintMatches >= 1) {
    // Complaints mixed with other keywords could be urgent
    let priority: TriagePriority = "medium";
    for (const [urgentKws, urg] of URGENCY_KEYWORDS) {
      if (urgentKws.some(kw => text.includes(kw))) priority = urg;
    }
    if (complaintMatches >= 3) priority = "high";
    return {
      category: "complaint",
      confidence: Math.min(0.4 + complaintMatches * 0.2, 0.9),
      details: complaintMatches >= 2 ? "Multiple complaints" : "General complaint",
      suggestedPriority: priority,
    };
  }

  // Default: question
  return {
    category: "question",
    confidence: 0.6,
    details: "General inquiry",
    suggestedPriority: "low",
  };
}

function priorityRank(p: TriagePriority): number {
  return { low: 0, medium: 1, high: 2, urgent: 3 }[p];
}

// ─── Category label helpers ───

export function maintenanceCategoryLabel(cat: MaintenanceCategory): string {
  const labels: Record<MaintenanceCategory, string> = {
    plumbing: "Plumbing",
    appliance: "Appliance",
    hvac: "HVAC",
    electrical: "Electrical",
    structural: "Structural",
    general: "General",
  };
  return labels[cat];
}

// ─── Auto-reply generator ───

const MANAGER_PHONE = "(555) 123-4567"; // Change this to the actual property manager phone

export function generateAutoReply(
  classification: ClassificationResult,
  guestName: string,
  ticketId?: string,
): { subject: string; body: string } {
  const name = guestName || "Guest";

  switch (classification.category) {
    case "maintenance": {
      const catLabel = classification.maintenanceCategory
        ? maintenanceCategoryLabel(classification.maintenanceCategory)
        : classification.details;
      const ticketLine = ticketId
        ? `A maintenance ticket (#${ticketId}) has been created for your ${catLabel.toLowerCase()} issue.`
        : `We've logged your ${catLabel.toLowerCase()} issue.`;
      return {
        subject: `Re: Maintenance request received — ${classification.details}`,
        body: `Hi ${name}, we've received your report about the ${catLabel.toLowerCase()} issue. ${ticketLine} Our team will address this shortly and we'll keep you updated on progress.\n\nIf this is urgent, please call us at ${MANAGER_PHONE}.\n\n— Eastman Premier Rentals`,
      };
    }
    case "billing":
      return {
        subject: "Re: Billing question received",
        body: `Hi ${name}, we've received your billing question. Our team will review this and respond within 1 business day.\n\n— Eastman Premier Rentals`,
      };
    case "complaint":
      return {
        subject: "Re: Your feedback has been received",
        body: `Hi ${name}, thank you for bringing this to our attention. A manager will personally review your concerns and reach out within 24 hours.\n\n— Eastman Premier Rentals`,
      };
    case "question":
    default:
      return {
        subject: "Re: Thanks for reaching out",
        body: `Hi ${name}, thanks for reaching out. We'll get back to you with an answer shortly.\n\n— Eastman Premier Rentals`,
      };
  }
}

// ─── Staff notification generator ───

export function generateStaffNotification(
  classification: ClassificationResult,
  guestName: string,
  guestEmail: string,
  subject: string,
  message: string,
  propertyName?: string,
  ticketId?: string,
): { subject: string; html: string } | null {
  const name = guestName || "Guest";

  switch (classification.category) {
    case "maintenance": {
      const catLabel = classification.maintenanceCategory
        ? maintenanceCategoryLabel(classification.maintenanceCategory)
        : classification.details;
      const ticketLine = ticketId ? `Ticket #${ticketId}` : "No ticket created";
      return {
        subject: `[Action Required] New maintenance: ${catLabel} at ${propertyName || "property"}`,
        html: `<!DOCTYPE html>
<html><body style="font-family:sans-serif;color:#111827;">
<h2 style="color:#0f3c52;">🔧 New Maintenance Request</h2>
<table style="border-collapse:collapse;width:100%;max-width:500px;">
<tr><td style="padding:6px 12px;color:#6b7280;">Guest</td><td style="padding:6px 12px;">${name} (${guestEmail})</td></tr>
<tr><td style="padding:6px 12px;color:#6b7280;">Property</td><td style="padding:6px 12px;">${propertyName || "N/A"}</td></tr>
<tr><td style="padding:6px 12px;color:#6b7280;">Category</td><td style="padding:6px 12px;">${catLabel}</td></tr>
<tr><td style="padding:6px 12px;color:#6b7280;">Priority</td><td style="padding:6px 12px;">${classification.suggestedPriority}</td></tr>
<tr><td style="padding:6px 12px;color:#6b7280;">Ticket</td><td style="padding:6px 12px;">${ticketLine}</td></tr>
</table>
<hr style="border:0;border-top:1px solid #e5e7eb;margin:16px 0;" />
<p style="color:#374151;white-space:pre-wrap;">${message}</p>
<p style="color:#6b7280;font-size:12px;">View in <a href="https://6cb00109005ce5add83d71c194d57d02.ctonew.app/maintenance" style="color:#0f3c52;">Maintenance Dashboard</a></p>
</body></html>`,
      };
    }
    case "complaint": {
      return {
        subject: `[Urgent] Guest complaint from ${name}`,
        html: `<!DOCTYPE html>
<html><body style="font-family:sans-serif;color:#111827;">
<h2 style="color:#dc2626;">⚠️ Guest Complaint</h2>
<table style="border-collapse:collapse;width:100%;max-width:500px;">
<tr><td style="padding:6px 12px;color:#6b7280;">Guest</td><td style="padding:6px 12px;">${name} (${guestEmail})</td></tr>
<tr><td style="padding:6px 12px;color:#6b7280;">Property</td><td style="padding:6px 12px;">${propertyName || "N/A"}</td></tr>
<tr><td style="padding:6px 12px;color:#6b7280;">Subject</td><td style="padding:6px 12px;">${subject}</td></tr>
</table>
<hr style="border:0;border-top:1px solid #e5e7eb;margin:16px 0;" />
<p style="color:#374151;white-space:pre-wrap;">${message}</p>
<p style="color:#dc2626;font-weight:600;">A manager should reach out within 24 hours.</p>
</body></html>`,
      };
    }
    // Billing and questions: no urgent notification — just logged to dashboard
    default:
      return null;
  }
}
