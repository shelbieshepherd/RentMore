// Airbnb API Client — OAuth 2.0 + mock-ready API shapes
// Requires Airbnb Software Partner approval to go live

import type { OtaListing, OtaReservation, OtaCredentials } from "../types";
import { getMappedListings, bookingsToOtaReservations } from "../mappers";
import { getSnapshot } from "~/lib/shared-store";

const BASE_URL = "https://api.airbnb.com/v2";
const AUTH_URL = "https://www.airbnb.com/oauth2/auth";
const TOKEN_URL = "https://api.airbnb.com/v2/oauth2/token";

function getClientId(): string | null {
  if (typeof window !== "undefined" && (window as any).__RENTVUE_ENV) {
    return (window as any).__RENTVUE_ENV.AIRBNB_CLIENT_ID || null;
  }
  return null;
}

function getClientSecret(): string | null {
  if (typeof window !== "undefined" && (window as any).__RENTVUE_ENV) {
    return (window as any).__RENTVUE_ENV.AIRBNB_CLIENT_SECRET || null;
  }
  return null;
}

/** Check if we have valid credentials to make API calls */
export function hasCredentials(): boolean {
  return !!(getClientId() && getClientSecret());
}

/** Get the OAuth authorize URL for starting the connection flow */
export function getAuthorizeUrl(redirectUri: string): string {
  const clientId = getClientId();
  if (!clientId) throw new Error("Airbnb client ID not configured");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "listings:read listings:write calendar:read calendar:write reservations:read",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/** Exchange OAuth code for tokens */
export async function exchangeCode(code: string, redirectUri: string): Promise<OtaCredentials> {
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  if (!clientId || !clientSecret) throw new Error("Airbnb credentials not configured");

  // Mock: return a simulated token
  return {
    accessToken: `mock_airbnb_token_${Date.now()}`,
    refreshToken: `mock_airbnb_refresh_${Date.now()}`,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };
}

/** Fetch OTA listings */
export async function fetchListings(credentials: OtaCredentials, connectionId = ""): Promise<OtaListing[]> {
  if (!hasCredentials()) throw new Error("Airbnb credentials not configured");
  return getMappedListings(connectionId, "airbnb");
}

/** Push availability blocks to Airbnb */
export async function pushAvailability(
  _credentials: OtaCredentials,
  _listingId: string,
  blocks: { startDate: string; endDate: string; available: boolean }[]
): Promise<void> {
  if (!hasCredentials()) throw new Error("Airbnb credentials not configured");
  // Write to shared store calendar blocks
  try {
    const { addBooking } = await import("~/lib/shared-store");
    const { properties } = getSnapshot();
    // Find the property that matches this listing
    const propId = _listingId.replace("airbnb-", "");
    const prop = properties.find(p => p.id === propId);
    if (prop) {
      for (const block of blocks) {
        if (!block.available) {
          addBooking({
            propertyId: prop.id,
            guestName: "OTA Sync Block",
            guestEmail: "sync@rentvue.local",
            startDate: block.startDate,
            endDate: block.endDate,
            status: "confirmed",
            totalAmount: 0,
            source: "airbnb",
          } as any);
        }
      }
    }
  } catch { /* best-effort availability push */ }
}

/** Fetch reservations from Airbnb */
export async function fetchReservations(credentials: OtaCredentials, connectionId = ""): Promise<OtaReservation[]> {
  if (!hasCredentials()) throw new Error("Airbnb credentials not configured");
  return bookingsToOtaReservations(connectionId, "airbnb");
}
