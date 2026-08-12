// RentVue — Reactive shared store (DB-backed when available, seed-data fallback otherwise)
// No localStorage — uses in-memory state with DB sync on init.
import {
  properties as seedProperties, tenants as seedTenants, payments as seedPayments,
  maintenanceRequests as seedMaintenance, ownerPayouts as seedPayouts,
  bookings as seedBookings, calendarBlocks as seedCalendarBlocks,
  owners as seedOwners, signedDocuments as seedSignedDocs,
  documentTemplates as seedDocTemplates, guestMessages as seedGuestMessages,
  propertyGuides as seedPropertyGuides, vendors as seedVendors,
  paymentMethods as seedPaymentMethods,
  type Property as PropertyType, type Tenant as TenantType,
  type Payment as PaymentType, type MaintenanceRequest as MaintenanceRequestType,
  type OwnerPayout as OwnerPayoutType, type Booking as BookingType,
  type CalendarBlock as CalendarBlockType, type Owner as OwnerType,
  type SignedDocument as SignedDocumentType,
  type DocumentTemplate as DocumentTemplateType,
  type GuestMessage as GuestMessageType, type PropertyGuide as PropertyGuideType,
  type Vendor as VendorType,
  type VendorPayout as VendorPayoutType,
  type OwnerCharge as OwnerChargeType,
  type PaymentMethodEntry as PaymentMethodEntryType,
} from "./data";
import {
  DEFAULT_COMPANY_ID,
} from "./db-queries";

// ── Re-export types ──
export type Property = PropertyType;
export type Tenant = TenantType;
export type Payment = PaymentType;
export type MaintenanceRequest = MaintenanceRequestType;
export type OwnerPayout = OwnerPayoutType;
export type Booking = BookingType;
export type CalendarBlock = CalendarBlockType;
export type Owner = OwnerType;
export type SignedDocument = SignedDocumentType;
export type DocumentTemplate = DocumentTemplateType;
export type GuestMessage = GuestMessageType;
export type PropertyGuide = PropertyGuideType;
export type Vendor = VendorType;
export type VendorPayout = VendorPayoutType;
export type OwnerCharge = OwnerChargeType;
export type PaymentMethodEntry = PaymentMethodEntryType;

// ── StoreState ──
export interface HousekeepingTask {
  id: string;
  propertyId: string;
  description: string;
  status: "pending" | "assigned" | "in-progress" | "verified" | "done";
  priority: "high" | "medium" | "low";
  assignedTo: string;
  dueDate: string;
  window: string;
  verifiedBy?: string;
}

export interface StoreState {
  properties: Property[];
  tenants: Tenant[];
  payments: Payment[];
  maintenanceRequests: MaintenanceRequest[];
  ownerPayouts: OwnerPayout[];
  bookings: Booking[];
  calendarBlocks: CalendarBlock[];
  housekeepingTasks: HousekeepingTask[];
  owners: Owner[];
  signedDocuments: SignedDocument[];
  documentTemplates: DocumentTemplate[];
  guestMessages: GuestMessage[];
  propertyGuides: PropertyGuide[];
  vendors: Vendor[];
  vendorPayouts: VendorPayout[];
  ownerCharges: OwnerCharge[];
  paymentMethods: PaymentMethodEntry[];
  companyId: string;
  dbConnected: boolean;
}

// ── Module-level state ──
function clone<T>(arr: readonly T[]): T[] { return arr.slice(); }

const state: StoreState = {
  properties: clone(seedProperties),
  tenants: clone(seedTenants),
  payments: clone(seedPayments),
  maintenanceRequests: clone(seedMaintenance),
  ownerPayouts: clone(seedPayouts),
  bookings: clone(seedBookings),
  calendarBlocks: clone(seedCalendarBlocks),
  housekeepingTasks: [],
  owners: clone(seedOwners),
  signedDocuments: clone(seedSignedDocs),
  documentTemplates: clone(seedDocTemplates),
  guestMessages: clone(seedGuestMessages),
  propertyGuides: clone(seedPropertyGuides),
  vendors: clone(seedVendors),
  vendorPayouts: [],
  ownerCharges: [],
  paymentMethods: clone(seedPaymentMethods),
  companyId: DEFAULT_COMPANY_ID,
  dbConnected: false,
};

const listeners = new Set<() => void>();
function notify() { for (const fn of listeners) fn(); }

// ── Core API ──
export function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
export function getSnapshot(): StoreState { return { ...state }; }
export function hydrateFromLocalStorage() {
  // No localStorage — try DB sync once
  trySyncFromDB();
}

function mapDbDocument(d: any): SignedDocument {
  const status = (["draft", "sent", "viewed", "renter-signed", "fully-executed"] as const).includes(d.status)
    ? d.status
    : d.status === "signed" ? "fully-executed" : "draft";
  return {
    id: d.id, bookingId: d.bookingId || undefined, propertyId: d.propertyId || "", ownerId: d.ownerId || "",
    type: (["lease", "rental-agreement", "owner-agreement", "addendum"] as const).includes(d.type) ? d.type : "lease",
    title: d.title, sentTo: d.recipientEmail || "", sentToName: d.recipientName || "",
    status, content: d.content || "", createdAt: d.createdAt || "",
  };
}

let syncAttempted = false;
async function trySyncFromDB() {
  if (syncAttempted) return;
  syncAttempted = true;
  try {
    const { fetchBookings, fetchTenants, fetchProperties, fetchPayments, fetchMaintenanceRequests, fetchOwners, fetchPaymentMethods, fetchVendors, fetchHousekeeping, fetchDocuments, fetchCalendarBlocks } = await import("./db-queries");
    const cid = state.companyId;
    const isDemo = cid === DEFAULT_COMPANY_ID;
    const results = await Promise.allSettled([
      fetchBookings({ data: { companyId: cid } }),
      fetchTenants({ data: { companyId: cid } }),
      fetchProperties({ data: { companyId: cid } }),
      fetchPayments({ data: { companyId: cid } }),
      fetchMaintenanceRequests({ data: { companyId: cid } }),
      fetchOwners({ data: { companyId: cid } }),
      fetchPaymentMethods({ data: { companyId: cid } }),
      fetchVendors({ data: { companyId: cid } }),
      fetchHousekeeping({ data: { companyId: cid } }),
      fetchDocuments({ data: { companyId: cid } }),
      fetchCalendarBlocks({ data: { companyId: cid } }),
    ]);
    // Race guard — if company changed mid-fetch, discard stale results
    if (state.companyId !== cid) {
      syncAttempted = false; // allow re-sync for new company
      trySyncFromDB();
      return;
    }
    // For real companies: always replace with DB results (even empty — that's "no data yet")
    // For demo company: only replace when DB has rows (keep seed data fallback)
    if (results[2].status === "fulfilled" && (!isDemo || results[2].value.length > 0)) {
      state.properties = results[2].value.map(mapDbProperty);
    }
    if (results[0].status === "fulfilled" && (!isDemo || results[0].value.length > 0)) {
      state.bookings = results[0].value.map(mapDbBooking);
    }
    if (results[1].status === "fulfilled" && (!isDemo || results[1].value.length > 0)) {
      state.tenants = results[1].value.map(mapDbTenant);
    }
    if (results[3].status === "fulfilled" && (!isDemo || results[3].value.length > 0)) {
      state.payments = results[3].value.map(mapDbPayment);
    }
    if (results[4].status === "fulfilled" && (!isDemo || results[4].value.length > 0)) {
      state.maintenanceRequests = results[4].value.map(mapDbMaintenance);
    }
    if (results[5].status === "fulfilled" && (!isDemo || results[5].value.length > 0)) {
      state.owners = results[5].value.map(mapDbOwner);
    }
    if (results[6].status === "fulfilled" && (!isDemo || results[6].value.length > 0)) {
      state.paymentMethods = results[6].value.map(mapDbPaymentMethod);
    }
    if (results[7].status === "fulfilled" && (!isDemo || results[7].value.length > 0)) {
      state.vendors = results[7].value;
    }
    if (results[8].status === "fulfilled" && (!isDemo || results[8].value.length > 0)) {
      state.housekeepingTasks = results[8].value;
    }
    if (results[9].status === "fulfilled" && (!isDemo || results[9].value.length > 0)) {
      state.signedDocuments = results[9].value.map(mapDbDocument);
    }
    if (results[10].status === "fulfilled" && (!isDemo || results[10].value.length > 0)) {
      state.calendarBlocks = results[10].value;
    }
    if (!isDemo) state.dbConnected = true; // real company with DB = connected
    else if (results.some((r, i) => r.status === "fulfilled" && r.value.length > 0)) state.dbConnected = true;
    notify();
  } catch { /* DB unavailable */ }
}

export function setCompanyId(id: string) {
  if (state.companyId === id) return;
  state.companyId = id;
  // After switching company, re-sync from DB for the new company
  syncAttempted = false;
  trySyncFromDB();
}

// ── DB mappers ──
function mapDbBooking(b: any): Booking {
  return {
    id: b.id, reservationNumber: b.reservation_number, propertyId: b.property_id,
    guestName: b.guest_name, guestEmail: b.guest_email, guestPhone: b.guest_phone,
    guestAddress: b.guest_address,
    startDate: String(b.start_date).slice(0, 10), endDate: String(b.end_date).slice(0, 10),
    nightlyRate: Number(b.nightly_rate), status: b.status === "no-show" ? "cancelled" : b.status,
    totalAmount: Number(b.total_amount), source: b.source,
    commissionRate: Number(b.commission_rate), createdAt: String(b.created_at),
    createdBy: b.created_by || "Admin",
    cleaningFee: b.cleaning_fee != null ? Number(b.cleaning_fee) : undefined,
    linenFee: b.linen_fee != null ? Number(b.linen_fee) : undefined,
    taxAmount: b.tax_amount != null ? Number(b.tax_amount) : undefined,
    activityLog: [], emailLog: [],
  };
}
function mapDbTenant(t: any): Tenant {
  return {
    id: t.id, name: t.name, email: t.email, phone: t.phone, address: t.address,
    propertyId: t.property_id, type: "tenant",
    leaseStart: t.lease_start ? String(t.lease_start).slice(0, 10) : undefined,
    leaseEnd: t.lease_end ? String(t.lease_end).slice(0, 10) : undefined,
    rentAmount: Number(t.monthly_rent), deposit: Number(t.security_deposit),
  };
}
function mapDbProperty(p: any): Property {
  return {
    id: p.id, name: p.name, address: p.address,
    type: p.property_type === "short_term" ? "short-term" : "long-term",
    status: p.status === "active" ? "vacant" : "occupied",
    monthlyRent: Number(p.monthly_rent), deposit: 0, ownerId: p.owner_id, image: p.image_url || "",
    cancellationPolicy: p.cancellation_policy || undefined,
    cancellationDetails: undefined,
    checkInTime: p.check_in_time || undefined,
    checkOutTime: p.check_out_time || undefined,
    houseRules: typeof p.house_rules === "string" ? JSON.parse(p.house_rules) : (p.house_rules || undefined),
    minStay: p.min_stay ? Number(p.min_stay) : undefined,
    maxStay: p.max_stay ? Number(p.max_stay) : undefined,
    petPolicy: p.pet_policy || undefined,
    petPolicyDetails: undefined,
    propertySubtype: p.property_subtype || undefined,
    floorLevel: undefined,
    beds: parseBedConfig(p.bed_config),
    bedrooms: Number(p.beds) || 1,
  };
}
function parseBedConfig(raw: unknown): { type: string; count: number }[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch { /* malformed JSON — ignore */ }
  return undefined;
}
function mapDbPayment(p: any): Payment {
  return {
    id: p.id, propertyId: p.property_id || "", tenantId: p.tenant_id || p.booking_id || "",
    amount: Number(p.amount_cents) / 100, // DB stores cents; UI amounts are dollars
    date: String(p.created_at).slice(0, 10), dueDate: String(p.created_at).slice(0, 10),
    status: p.status === "completed" ? "paid" : p.status === "pending" ? "pending" : "overdue",
    method: p.method as Payment["method"], description: p.description || "",
    bookingId: p.booking_id || undefined,
    disputeStatus: p.dispute_status || undefined,
  };
}
function mapDbMaintenance(m: any): MaintenanceRequest {
  return {
    id: m.id, propertyId: m.property_id, description: m.description || m.title,
    priority: m.priority as MaintenanceRequest["priority"],
    status: (m.status === "completed" ? "resolved" : m.status) as MaintenanceRequest["status"],
    assignedTo: m.vendor_id || "", dateReported: String(m.created_at).slice(0, 10),
    cost: 0, chargedToOwner: false,
  };
}
function mapDbOwner(o: any): Owner {
  return {
    id: o.id, name: o.name, email: o.email, phone: o.phone,
    properties: [], commissionRate: 0, payoutSchedule: o.payout_schedule || "monthly",
    stripeAccountId: o.stripe_connect_id,
  };
}
function mapDbPaymentMethod(pm: any): PaymentMethodEntry {
  return {
    id: pm.id, propertyId: pm.property_id || "",
    methodType: pm.method_type as PaymentMethodEntry["methodType"],
    label: pm.label, cardLast4: pm.card_last4,
    cardExpiry: pm.card_expiry, cardBrand: pm.card_brand,
    bankName: pm.bank_name, accountLast4: pm.account_last4,
    routingLast4: pm.routing_last4, isDefault: pm.is_default ?? false,
    billingAddress: undefined,
  };
}

// ── Mutation functions (optimistic in-memory + silent DB persist) ──
function persistQuietly(fn: () => Promise<void>) {
  (async () => { try { await fn(); } catch { /* DB unavailable — demo mode OK */ } })();
}

export function addProperty(p: Omit<Property, "id">): Property {
  const entry: Property = { ...p, id: crypto.randomUUID() };
  state.properties.push(entry); notify();
  persistQuietly(async () => {
    const { insertProperty } = await import("./db-queries");
    await insertProperty({ data: {
      companyId: state.companyId, name: entry.name, address: entry.address,
      type: entry.type, monthlyRent: entry.monthlyRent, deposit: entry.deposit || 0,
      status: entry.status, ownerId: entry.ownerId,
      nightlyRate: entry.type === "short-term" ? entry.monthlyRent : undefined,
      beds: entry.bedrooms, baths: entry.baths,
      bedConfig: entry.beds && entry.beds.length > 0 ? entry.beds : undefined,
      imageUrl: entry.image || undefined,
      cancellationPolicy: entry.cancellationPolicy,
      checkInTime: entry.checkInTime, checkOutTime: entry.checkOutTime,
      houseRules: entry.houseRules, minStay: entry.minStay, maxStay: entry.maxStay,
      petPolicy: entry.petPolicy, propertySubtype: entry.propertySubtype,
    }});
  });
  return entry;
}
export function updateProperty(id: string, updates: Partial<Property>) {
  const idx = state.properties.findIndex(x => x.id === id);
  if (idx >= 0) { Object.assign(state.properties[idx], updates); notify(); }
  persistQuietly(async () => {
    const { updatePropertyDB } = await import("./db-queries");
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.address !== undefined) dbUpdates.address = updates.address;
    if (updates.type !== undefined) dbUpdates.property_type = updates.type === "short-term" ? "short_term" : "long_term";
    if (updates.status !== undefined) dbUpdates.status = updates.status === "vacant" ? "active" : updates.status;
    if (updates.monthlyRent !== undefined) dbUpdates.monthly_rent = updates.monthlyRent;
    if (updates.ownerId !== undefined) dbUpdates.owner_id = updates.ownerId;
    if (updates.image !== undefined) dbUpdates.image_url = updates.image;
    if (updates.cancellationPolicy !== undefined) dbUpdates.cancellation_policy = updates.cancellationPolicy;
    if (updates.checkInTime !== undefined) dbUpdates.check_in_time = updates.checkInTime;
    if (updates.checkOutTime !== undefined) dbUpdates.check_out_time = updates.checkOutTime;
    if (updates.houseRules !== undefined) dbUpdates.house_rules = JSON.stringify(updates.houseRules);
    if (updates.minStay !== undefined) dbUpdates.min_stay = updates.minStay;
    if (updates.maxStay !== undefined) dbUpdates.max_stay = updates.maxStay;
    if (updates.petPolicy !== undefined) dbUpdates.pet_policy = updates.petPolicy;
    if (updates.propertySubtype !== undefined) dbUpdates.property_subtype = updates.propertySubtype;
    if (updates.bedrooms !== undefined) dbUpdates.beds = updates.bedrooms;
    if (updates.beds !== undefined) dbUpdates.bedConfig = updates.beds.length > 0 ? updates.beds : null;
    if (Object.keys(dbUpdates).length) {
      await updatePropertyDB({ data: { propertyId: id, updates: dbUpdates } });
    }
  });
}
export function addTenant(t: Omit<Tenant, "id">): Tenant {
  const entry: Tenant = { ...t, id: crypto.randomUUID() };
  state.tenants.push(entry); notify();
  persistQuietly(async () => {
    const { insertTenant } = await import("./db-queries");
    await insertTenant({ data: {
      companyId: state.companyId, propertyId: entry.propertyId,
      name: entry.name, email: entry.email, phone: entry.phone,
      address: entry.address, leaseStart: entry.leaseStart || new Date().toISOString().slice(0, 10),
      leaseEnd: entry.leaseEnd || "", monthlyRent: entry.rentAmount, deposit: entry.deposit,
    }});
  });
  return entry;
}
export function addGuest(g: Omit<Tenant, "id">): Tenant {
  const entry: Tenant = { ...g, id: crypto.randomUUID(), type: "guest" };
  state.tenants.push(entry); notify();
  // Guests are stored as tenants — persist same way
  persistQuietly(async () => {
    const { insertTenant } = await import("./db-queries");
    await insertTenant({ data: {
      companyId: state.companyId, propertyId: entry.propertyId,
      name: entry.name, email: entry.email, phone: entry.phone,
      address: entry.address, leaseStart: entry.leaseStart || new Date().toISOString().slice(0, 10),
      leaseEnd: entry.leaseEnd || "", monthlyRent: entry.rentAmount, deposit: entry.deposit,
    }});
  });
  return entry;
}
export function addMaintenanceRequest(m: Omit<MaintenanceRequest, "id">): MaintenanceRequest {
  const entry: MaintenanceRequest = { ...m, id: crypto.randomUUID() };
  state.maintenanceRequests.push(entry); notify();
  persistQuietly(async () => {
    const { insertMaintenanceRequest } = await import("./db-queries");
    await insertMaintenanceRequest({ data: {
      companyId: state.companyId, propertyId: entry.propertyId,
      title: entry.description, description: entry.description,
      priority: entry.priority,
    }});
  });
  return entry;
}
export function updateMaintenanceRequest(id: string, updates: Partial<MaintenanceRequest>) {
  const idx = state.maintenanceRequests.findIndex(x => x.id === id);
  if (idx >= 0) { Object.assign(state.maintenanceRequests[idx], updates); notify(); }
  persistQuietly(async () => {
    const { updateMaintenanceRequestDB } = await import("./db-queries");
    const dbUpdates: Record<string, unknown> = {};
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.assignedTo !== undefined) dbUpdates.vendor_id = updates.assignedTo;
    if (Object.keys(dbUpdates).length) {
      await updateMaintenanceRequestDB({ data: { requestId: id, updates: dbUpdates } });
    }
  });
}
export function addMaintenanceNote(_id: string, _note: string) {
  // Placeholder — maintenance notes stored in state
}
export function addBooking(b: Omit<Booking, "id" | "reservationNumber" | "activityLog" | "emailLog"> & { reservationNumber?: string }): Booking {
  const entry: Booking = {
    ...b, id: crypto.randomUUID(),
    reservationNumber: b.reservationNumber || `BK-${Date.now().toString(36).toUpperCase()}`,
    activityLog: [], emailLog: [],
  };
  state.bookings.push(entry); notify();
  persistQuietly(async () => {
    const { insertBooking } = await import("./db-queries");
    await insertBooking({ data: {
      companyId: state.companyId, propertyId: entry.propertyId,
      guestName: entry.guestName, guestEmail: entry.guestEmail,
      guestPhone: entry.guestPhone, guestAddress: entry.guestAddress,
      startDate: entry.startDate, endDate: entry.endDate,
      nightlyRate: entry.nightlyRate, status: entry.status,
      totalAmount: entry.totalAmount, source: entry.source,
      commissionRate: entry.commissionRate, createdBy: entry.createdBy || "Admin",
      cleaningFee: entry.cleaningFee, linenFee: entry.linenFee, taxAmount: entry.taxAmount,
    }});
  });
  return entry;
}
export function updateBooking(id: string, updates: Partial<Booking>) {
  const idx = state.bookings.findIndex(x => x.id === id);
  if (idx >= 0) { Object.assign(state.bookings[idx], updates); notify(); }
  persistQuietly(async () => {
    const { updateBookingDB } = await import("./db-queries");
    const dbUpdates: Record<string, unknown> = {};
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.guestName !== undefined) dbUpdates.guest_name = updates.guestName;
    if (updates.guestEmail !== undefined) dbUpdates.guest_email = updates.guestEmail;
    if (updates.startDate !== undefined) dbUpdates.start_date = updates.startDate;
    if (updates.endDate !== undefined) dbUpdates.end_date = updates.endDate;
    if (updates.totalAmount !== undefined) dbUpdates.total_amount = updates.totalAmount;
    if (updates.commissionRate !== undefined) dbUpdates.commission_rate = updates.commissionRate;
    if (updates.cleaningFee !== undefined) dbUpdates.cleaning_fee = updates.cleaningFee;
    if (updates.linenFee !== undefined) dbUpdates.linen_fee = updates.linenFee;
    if (updates.taxAmount !== undefined) dbUpdates.tax_amount = updates.taxAmount;
    if (Object.keys(dbUpdates).length) {
      await updateBookingDB({ data: { bookingId: id, updates: dbUpdates } });
    }
  });
}
export function addPayment(p: Omit<Payment, "id">): Payment {
  const entry: Payment = { ...p, id: crypto.randomUUID() };
  state.payments.push(entry); notify();
  persistQuietly(async () => {
    const { insertPayment } = await import("./db-queries");
    await insertPayment({ data: {
      companyId: state.companyId, propertyId: entry.propertyId,
      paymentType: "charge", method: entry.method,
      amountCents: Math.round(entry.amount * 100),
      description: entry.description,
      status: entry.status === "paid" ? "completed" : entry.status === "pending" ? "pending" : "failed",
    }});
  });
  return entry;
}
export function updatePaymentStatus(id: string, status: Payment["status"]) {
  const idx = state.payments.findIndex(x => x.id === id);
  if (idx >= 0) { state.payments[idx].status = status; notify(); }
  persistQuietly(async () => {
    const { updatePaymentStatusDB } = await import("./db-queries");
    const dbStatus = status === "paid" ? "completed" : status === "pending" ? "pending" : "failed";
    await updatePaymentStatusDB({ data: { paymentId: id, status: dbStatus } });
  });
}
export function addOwner(o: Omit<Owner, "id">): Owner {
  const entry: Owner = { ...o, id: crypto.randomUUID(), propertyIds: o.propertyIds ?? [] };
  state.owners.push(entry); notify();
  persistQuietly(async () => {
    const { insertOwner } = await import("./db-queries");
    await insertOwner({ data: {
      companyId: state.companyId, name: entry.name, email: entry.email, phone: entry.phone,
    }});
  });
  return entry;
}
export function addStoredPaymentMethod(method: Omit<PaymentMethodEntry, "id">): PaymentMethodEntry {
  const entry: PaymentMethodEntry = { ...method, id: crypto.randomUUID() };
  state.paymentMethods.push(entry); notify();
  persistQuietly(async () => {
    const { insertPaymentMethod } = await import("./db-queries");
    await insertPaymentMethod({ data: {
      companyId: state.companyId, propertyId: method.propertyId,
      methodType: method.methodType,
      label: method.label, cardLast4: method.cardLast4,
      cardExpiry: method.cardExpiry, cardBrand: method.cardBrand,
      bankName: method.bankName, accountLast4: method.accountLast4,
      routingLast4: method.routingLast4, isDefault: method.isDefault,
    }});
  });
  return entry;
}
export function removeStoredPaymentMethod(id: string) {
  const idx = state.paymentMethods.findIndex(x => x.id === id);
  if (idx >= 0) { state.paymentMethods.splice(idx, 1); notify(); }
  persistQuietly(async () => {
    const { deletePaymentMethod } = await import("./db-queries");
    await deletePaymentMethod({ data: { methodId: id } });
  });
  return idx >= 0;
}

// ── Non-DB-persisted mutations (in-memory only — no DB table yet) ──
export function addDocument(d: Omit<SignedDocument, "id">): SignedDocument {
  const entry: SignedDocument = { ...d, id: crypto.randomUUID() };
  state.signedDocuments.push(entry); notify(); return entry;
}
export function signDocument(docId: string, signer: string) {
  const doc = state.signedDocuments.find(d => d.id === docId);
  if (doc) {
    if (!doc.signatures) doc.signatures = [];
    doc.signatures.push(signer);
    if (doc.signatures.length >= 2) doc.status = "signed";
    notify();
  }
}
export function signDocumentOwner(docId: string) {
  const doc = state.signedDocuments.find(d => d.id === docId);
  if (doc) {
    if (!doc.ownerSignatures) doc.ownerSignatures = [];
    doc.ownerSignatures.push("Owner");
    if (doc.ownerSignatures.length >= 1) doc.status = "signed";
    notify();
  }
}
export function addTemplate(t: Omit<DocumentTemplate, "id">): DocumentTemplate {
  const entry: DocumentTemplate = { ...t, id: crypto.randomUUID() };
  state.documentTemplates.push(entry); notify(); return entry;
}
export function updateTemplate(id: string, updates: Partial<DocumentTemplate>) {
  const idx = state.documentTemplates.findIndex(x => x.id === id);
  if (idx >= 0) { Object.assign(state.documentTemplates[idx], updates); notify(); }
}
export function deleteTemplate(id: string) {
  const idx = state.documentTemplates.findIndex(x => x.id === id);
  if (idx >= 0) { state.documentTemplates.splice(idx, 1); notify(); }
}
export function addGuestMessage(gm: Omit<GuestMessage, "id">): GuestMessage {
  const entry: GuestMessage = { ...gm, id: crypto.randomUUID() };
  state.guestMessages.push(entry); notify(); return entry;
}
export function updatePropertyGuide(propertyId: string, guide: Partial<PropertyGuide>) {
  const existing = state.propertyGuides.find(g => g.propertyId === propertyId);
  if (existing) {
    Object.assign(existing, guide); notify();
  } else {
    const entry: PropertyGuide = { propertyId, ...guide } as PropertyGuide;
    state.propertyGuides.push(entry); notify();
  }
}
export function addVendor(v: Omit<Vendor, "id">): Vendor {
  const entry: Vendor = { ...v, id: crypto.randomUUID() };
  state.vendors.push(entry); notify(); return entry;
}
export function updateVendor(id: string, updates: Partial<Vendor>) {
  const idx = state.vendors.findIndex(x => x.id === id);
  if (idx >= 0) { Object.assign(state.vendors[idx], updates); notify(); }
}
export function deleteVendor(id: string) {
  const idx = state.vendors.findIndex(x => x.id === id);
  if (idx >= 0) { state.vendors.splice(idx, 1); notify(); }
}
export function addVendorRecord(v: Vendor) {
  state.vendors.unshift(v); notify();
}
// ── Housekeeping store mutations (DB-persisted; the page calls server fns, then these keep the store in sync) ──
export function addStoreHousekeeping(task: HousekeepingTask) {
  state.housekeepingTasks.unshift(task); notify();
}
export function patchStoreHousekeeping(taskId: string, updates: Partial<HousekeepingTask>) {
  const t = state.housekeepingTasks.find(x => x.id === taskId);
  if (t) { Object.assign(t, updates); notify(); }
}
export function removeStoreHousekeeping(taskId: string) {
  const i = state.housekeepingTasks.findIndex(x => x.id === taskId);
  if (i >= 0) { state.housekeepingTasks.splice(i, 1); notify(); }
}
export function addStoreDocument(doc: SignedDocument) {
  state.signedDocuments.unshift(doc); notify();
}
export function addVendorPayout(vp: Omit<VendorPayout, "id">): VendorPayout {
  const entry: VendorPayout = { ...vp, id: crypto.randomUUID() };
  state.vendorPayouts.push(entry); notify(); return entry;
}
export function updateVendorPayout(id: string, updates: Partial<VendorPayout>) {
  const idx = state.vendorPayouts.findIndex(x => x.id === id);
  if (idx >= 0) { Object.assign(state.vendorPayouts[idx], updates); notify(); }
}
export function addOwnerCharge(oc: Omit<OwnerCharge, "id">): OwnerCharge {
  const entry: OwnerCharge = { ...oc, id: crypto.randomUUID() };
  state.ownerCharges.push(entry); notify(); return entry;
}
export function addOwnerPayout(op: Omit<OwnerPayout, "id">): OwnerPayout {
  const entry: OwnerPayout = { ...op, id: crypto.randomUUID() };
  state.ownerPayouts.push(entry); notify(); return entry;
}
export function updateOwnerPayout(id: string, patch: Partial<OwnerPayout>): OwnerPayout | undefined {
  const idx = state.ownerPayouts.findIndex((op) => op.id === id);
  if (idx === -1) return undefined;
  state.ownerPayouts[idx] = { ...state.ownerPayouts[idx], ...patch };
  notify();
  return state.ownerPayouts[idx];
}
