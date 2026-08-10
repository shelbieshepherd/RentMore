import type { Booking, PropertyGuide } from "./data";

export interface DoorCodeResult {
  code: string;
  isActive: boolean;
}

/** Extract last 4 digits of a phone, e.g. "555-0123" → "0123" */
export function extractCodeFromPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-4);
}

/**
 * Get the auto-generated guest door code from their phone number.
 * Active window: check-in day 00:00 → checkout day 23:59.
 */
export function getGuestDoorCode(
  booking: Booking | undefined,
  guide: PropertyGuide | undefined
): DoorCodeResult | null {
  if (!booking?.guestPhone) return null;

  const code = extractCodeFromPhone(booking.guestPhone);
  const now = new Date();

  // Parse dates as local midnight
  const checkIn = new Date(booking.startDate + "T00:00:00");
  const checkOut = new Date(booking.endDate + "T23:59:59");

  const isActive = now >= checkIn && now <= checkOut;

  return { code, isActive };
}

/** Get the master door code — always active. */
export function getMasterCode(guide: PropertyGuide | undefined): string {
  return guide?.masterDoorCode ?? "";
}
