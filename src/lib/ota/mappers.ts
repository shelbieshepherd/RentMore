// OTA mappers — convert RentVue domain objects to OTA shapes
import type { OtaListing, OtaReservation, OtaProvider } from "./types";
import type { Property } from "~/lib/data";
import { getSnapshot } from "~/lib/shared-store";

/** Map a RentVue Property to an OtaListing for a given connection + provider */
export function propertyToOtaListing(
  property: Property,
  connectionId: string,
  provider: OtaProvider,
): OtaListing {
  const images = property.images
    ? property.images.map((img) =>
        typeof img === "string" ? img : img.url
      )
    : [];

  return {
    id: `ota-list-${property.id}`,
    connectionId,
    otaListingId: `${provider}-${property.id}`,
    rentvuePropertyId: property.id,
    title: property.name,
    url: `https://${provider === "airbnb" ? "airbnb.com" : provider === "vrbo" ? "vrbo.com" : "booking.com"}/h/${property.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    maxGuests: property.maxGuests,
    nightlyRate: property.nightlyRate ?? property.monthlyRent / 30,
    currency: "USD",
    images,
    // OTA-enriched fields
    beds: property.beds?.map((b) => ({ type: b.type, count: b.count })),
    cancellationPolicy: property.cancellationPolicy,
    houseRules: property.houseRules,
    checkInTime: property.checkInTime,
    checkOutTime: property.checkOutTime,
    petPolicy: property.petPolicy,
    propertySubtype: property.propertySubtype,
    amenities: property.amenities,
    minStay: property.minStay,
    maxStay: property.maxStay,
    description: property.description,
    sqft: property.sqft,
  };
}

/** Map RentVue bookings (from store) to OtaReservations for a given connection */
export function bookingsToOtaReservations(
  connectionId: string,
  provider: OtaProvider,
): OtaReservation[] {
  const { bookings } = getSnapshot();

  return bookings
    .filter((b) => b.status !== "cancelled")
    .map((b, i) => ({
      id: `ota-res-${provider}-${i}`,
      connectionId,
      otaReservationId: `${provider}-res-${b.id}`,
      rentvueBookingId: b.id,
      otaListingId: `${provider}-${b.propertyId}`,
      guestName: b.guestName,
      guestEmail: b.guestEmail ?? "",
      guestPhone: "",
      checkIn: b.startDate,
      checkOut: b.endDate,
      guests: b.guests ?? 1,
      totalAmount: b.totalAmount ?? (b.nightlyRate ?? 0) * Math.max(1, (new Date(b.endDate).getTime() - new Date(b.startDate).getTime()) / 86400000),
      currency: "USD",
      status: b.status === "confirmed" ? "confirmed" as const : "cancelled" as const,
      source: provider === "bookingcom" ? "bookingcom" : provider,
    }));
}

/** Get all RentVue properties mapped to OTA listings for a connection */
export function getMappedListings(
  connectionId: string,
  provider: OtaProvider,
): OtaListing[] {
  const { properties } = getSnapshot();
  // Filter to short-term properties (most relevant for OTAs)
  const relevant = properties.length > 0 ? properties : [];
  return relevant.map((p) => propertyToOtaListing(p, connectionId, provider));
}
