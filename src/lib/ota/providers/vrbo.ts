// VRBO/HomeAway API Client — OAuth 2.0 + mock-ready API shapes
// Requires VRBO Partner approval to go live

import type { OtaListing, OtaReservation, OtaCredentials } from "../types";
import { getMappedListings, bookingsToOtaReservations } from "../mappers";
import { getSnapshot } from "~/lib/shared-store";

const AUTH_URL = "https://api.vrbo.com/oauth2/auth";
const TOKEN_URL = "https://api.vrbo.com/oauth2/token";

function getClientId(): string | null {
  if (typeof window !== "undefined" && (window as any).__RENTVUE_ENV) {
    return (window as any).__RENTVUE_ENV.VRBO_CLIENT_ID || null;
  }
  return null;
}

function getClientSecret(): string | null {
  if (typeof window !== "undefined" && (window as any).__RENTVUE_ENV) {
    return (window as any).__RENTVUE_ENV.VRBO_CLIENT_SECRET || null;
  }
  return null;
}

export function hasCredentials(): boolean {
  return !!(getClientId() && getClientSecret());
}

export function getAuthorizeUrl(redirectUri: string): string {
  const clientId = getClientId();
  if (!clientId) throw new Error("VRBO client ID not configured");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "listing:read calendar:read calendar:write reservation:read",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<OtaCredentials> {
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  if (!clientId || !clientSecret) throw new Error("VRBO credentials not configured");
  return {
    accessToken: `mock_vrbo_token_${Date.now()}`,
    refreshToken: `mock_vrbo_refresh_${Date.now()}`,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };
}

export async function fetchListings(credentials: OtaCredentials, connectionId = ""): Promise<OtaListing[]> {
  if (!hasCredentials()) throw new Error("VRBO credentials not configured");
  return getMappedListings(connectionId, "vrbo");
}

export async function pushAvailability(
  _credentials: OtaCredentials,
  _listingId: string,
  blocks: { startDate: string; endDate: string; available: boolean }[]
): Promise<void> {
  if (!hasCredentials()) throw new Error("VRBO credentials not configured");
  try {
    const { addBooking } = await import("~/lib/shared-store");
    const { properties } = getSnapshot();
    const propId = _listingId.replace("vrbo-", "");
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
            source: "vrbo",
          } as any);
        }
      }
    }
  } catch { /* best-effort */ }
}

export async function fetchReservations(credentials: OtaCredentials, connectionId = ""): Promise<OtaReservation[]> {
  if (!hasCredentials()) throw new Error("VRBO credentials not configured");
  return bookingsToOtaReservations(connectionId, "vrbo");
}
