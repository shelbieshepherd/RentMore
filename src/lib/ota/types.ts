// OTA Integration Types
export type OtaProvider = "airbnb" | "bookingcom" | "vrbo";

export type OtaConnectionStatus = "connected" | "error" | "syncing" | "disconnected";

export interface OtaConnection {
  id: string;
  provider: OtaProvider;
  name: string;
  status: OtaConnectionStatus;
  lastSyncedAt: string | null;
  errorMessage: string | null;
  credentials: OtaCredentials | null;
  createdAt: string;
}

export interface OtaCredentials {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  apiKey?: string; // Booking.com uses API key
}

export interface OtaListing {
  id: string;
  connectionId: string;
  otaListingId: string;
  rentvuePropertyId: string | null; // null = unmapped
  title: string;
  url: string;
  bedrooms: number;
  bathrooms: number;
  maxGuests: number;
  nightlyRate: number;
  currency: string;
  images: string[];
  // ── OTA-enriched fields from RentVue Property ──
  beds?: { type: string; count: number }[];
  cancellationPolicy?: string;
  houseRules?: string[];
  checkInTime?: string;
  checkOutTime?: string;
  petPolicy?: string;
  propertySubtype?: string;
  amenities?: string[];
  minStay?: number;
  maxStay?: number;
  description?: string;
  sqft?: number;
}

export interface OtaReservation {
  id: string;
  connectionId: string;
  otaReservationId: string;
  rentvueBookingId: string | null;
  otaListingId: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  totalAmount: number;
  currency: string;
  status: "confirmed" | "cancelled" | "modified";
  source: OtaProvider;
}

export interface SyncLogEntry {
  id: string;
  provider: OtaProvider;
  connectionId: string;
  action: string;
  result: "success" | "error" | "skipped";
  details: string;
  timestamp: string;
}

export const OTA_PROVIDER_LABELS: Record<OtaProvider, { name: string; icon: string; color: string }> = {
  airbnb: { name: "Airbnb", icon: "🏠", color: "#FF5A5F" },
  bookingcom: { name: "Booking.com", icon: "🏨", color: "#003580" },
  vrbo: { name: "VRBO", icon: "🏡", color: "#3A84B3" },
};
