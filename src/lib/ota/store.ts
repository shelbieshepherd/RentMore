// OTA Store — localStorage-backed persistence for OTA connections, listings, reservations, sync log

import type {
  OtaProvider, OtaConnection, OtaListing, OtaReservation, SyncLogEntry,
} from "./types";

const STORE_KEY = "rentvue_ota_store_v1";

interface OtaStore {
  connections: OtaConnection[];
  listings: OtaListing[];
  reservations: OtaReservation[];
  syncLog: SyncLogEntry[];
}

function getStore(): OtaStore {
  if (typeof window === "undefined") return { connections: [], listings: [], reservations: [], syncLog: [] };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { connections: [], listings: [], reservations: [], syncLog: [] };
}

function saveStore(store: OtaStore) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

function uid() {
  return `ota-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Connections ───

export function getConnections(): OtaConnection[] {
  return getStore().connections;
}

export function getConnection(id: string): OtaConnection | undefined {
  return getStore().connections.find(c => c.id === id);
}

export function getConnectionByProvider(provider: OtaProvider): OtaConnection | undefined {
  return getStore().connections.find(c => c.provider === provider);
}

export function addConnection(provider: OtaProvider, name: string, credentials?: OtaConnection["credentials"]): OtaConnection {
  const store = getStore();
  const conn: OtaConnection = {
    id: uid(),
    provider,
    name,
    status: "connected",
    lastSyncedAt: null,
    errorMessage: null,
    credentials: credentials || null,
    createdAt: new Date().toISOString(),
  };
  store.connections.push(conn);
  saveStore(store);
  return conn;
}

export function updateConnection(id: string, updates: Partial<OtaConnection>) {
  const store = getStore();
  const idx = store.connections.findIndex(c => c.id === id);
  if (idx === -1) return;
  store.connections[idx] = { ...store.connections[idx], ...updates };
  saveStore(store);
}

export function removeConnection(id: string) {
  const store = getStore();
  store.connections = store.connections.filter(c => c.id !== id);
  store.listings = store.listings.filter(l => l.connectionId !== id);
  store.reservations = store.reservations.filter(r => r.connectionId !== id);
  saveStore(store);
}

// ─── Listings ───

export function getOtaListings(connectionId?: string): OtaListing[] {
  const all = getStore().listings;
  return connectionId ? all.filter(l => l.connectionId === connectionId) : all;
}

export function linkOtaListing(listingId: string, rentvuePropertyId: string | null) {
  const store = getStore();
  const idx = store.listings.findIndex(l => l.id === listingId);
  if (idx === -1) return;
  store.listings[idx].rentvuePropertyId = rentvuePropertyId;
  saveStore(store);
}

export function upsertOtaListings(listings: OtaListing[]) {
  const store = getStore();
  for (const listing of listings) {
    const idx = store.listings.findIndex(l => l.otaListingId === listing.otaListingId && l.connectionId === listing.connectionId);
    if (idx >= 0) {
      store.listings[idx] = { ...store.listings[idx], ...listing, id: store.listings[idx].id };
    } else {
      store.listings.push(listing);
    }
  }
  saveStore(store);
}

// ─── Reservations ───

export function getOtaReservations(connectionId?: string): OtaReservation[] {
  const all = getStore().reservations;
  return connectionId ? all.filter(r => r.connectionId === connectionId) : all;
}

export function upsertOtaReservation(res: OtaReservation) {
  const store = getStore();
  const idx = store.reservations.findIndex(r =>
    r.otaReservationId === res.otaReservationId && r.connectionId === res.connectionId
  );
  if (idx >= 0) {
    store.reservations[idx] = { ...res, id: store.reservations[idx].id };
  } else {
    store.reservations.push(res);
  }
  saveStore(store);
}

export function upsertOtaReservations(reservations: OtaReservation[]) {
  for (const r of reservations) upsertOtaReservation(r);
}

export function linkOtaReservation(otaReservationId: string, rentvueBookingId: string) {
  const store = getStore();
  const idx = store.reservations.findIndex(r => r.otaReservationId === otaReservationId);
  if (idx === -1) return;
  store.reservations[idx].rentvueBookingId = rentvueBookingId;
  saveStore(store);
}

// ─── Sync Log ───

export function getSyncLog(connectionId?: string, limit = 50): SyncLogEntry[] {
  const all = getStore().syncLog;
  const filtered = connectionId ? all.filter(l => l.connectionId === connectionId) : all;
  return filtered.slice(-limit);
}

export function addSyncLog(connectionId: string, provider: OtaProvider, action: string, result: SyncLogEntry["result"], details: string) {
  const store = getStore();
  store.syncLog.push({
    id: uid(),
    provider,
    connectionId,
    action,
    result,
    details,
    timestamp: new Date().toISOString(),
  });
  // Keep last 200 entries
  if (store.syncLog.length > 200) store.syncLog = store.syncLog.slice(-200);
  saveStore(store);
}
