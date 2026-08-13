import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useStore } from "~/lib/store";
import { getImageSrc, formatCurrency } from "~/lib/data";
import { getGuestDoorCode } from "~/lib/door-codes";
import type { Booking, PropertyGuide } from "~/lib/data";
import { addMaintenanceRequest } from "~/lib/shared-store";
import { queueEmail } from "~/lib/email";
import { classifyMessage, generateAutoReply, generateStaffNotification, maintenanceCategoryLabel } from "~/lib/triage";
import { depositFor, balanceDueDate, DEPOSIT_PER_BLOCK_CENTS } from "~/lib/payment-policy";

const MANAGER_EMAIL = "manager@rentmore.com";
const MANAGER_PHONE = "(555) 123-4567";
const BRAND = "#0f3c52";
const BASE_URL = "https://rentmorevrs.com";

export const Route = createFileRoute("/guest/$bookingId")({
  component: GuestPortal,
});

/** Booking fields the portal renders (subset of the DB booking row). */
interface PortalBooking {
  id: string;
  companyId?: string;
  propertyId: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  startDate: string;
  endDate: string;
  nightlyRate: number;
  totalAmount: number;
  reservationNumber: string;
  depositCollectedCents: number;
}
interface PortalProperty {
  id: string;
  name: string;
  address: string;
  type: "short-term" | "long-term";
  images: string[];
  houseRules?: string[];
  checkInTime?: string;
  checkOutTime?: string;
}

function safeJsonArr(raw: unknown): string[] | undefined {
  if (typeof raw !== "string") return undefined;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : undefined;
  } catch {
    return undefined;
  }
}

function GuestPortal() {
  const params = Route.useParams();
  const store = useStore();
  const storeBooking = store.bookings.find((b) => b.id === params.bookingId);
  const storeProperty = storeBooking
    ? store.properties.find((p) => p.id === storeBooking.propertyId)
    : undefined;
  const storeGuide = storeProperty
    ? store.propertyGuides.find((g) => g.propertyId === storeProperty.id)
    : undefined;

  // DB resolution for real companies (guests aren't authenticated, so the store
  // only carries demo/seed data — real bookings come from the DB by reservation
  // number or booking id). Demo stays on the store path.
  const [dbBooking, setDbBooking] = useState<PortalBooking | null>(null);
  const [dbProperty, setDbProperty] = useState<PortalProperty | null>(null);
  const [connect, setConnect] = useState<{ accountId: string | null; onboardingComplete: boolean; isDemo: boolean } | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { fetchBookingByReservationNumber, fetchConnectStatus } = await import("~/lib/db-queries");
        const b = await fetchBookingByReservationNumber({ data: { reservationNumber: params.bookingId } });
        if (cancelled) return;
        if (b) {
          setDbBooking({
            id: b.id,
            companyId: b.company_id,
            propertyId: b.property_id,
            guestName: b.guest_name,
            guestEmail: b.guest_email,
            guestPhone: b.guest_phone || undefined,
            startDate: String(b.start_date).slice(0, 10),
            endDate: String(b.end_date).slice(0, 10),
            nightlyRate: Number(b.nightly_rate),
            totalAmount: Number(b.total_amount),
            reservationNumber: b.reservation_number,
            depositCollectedCents: b.deposit_collected_cents ? Number(b.deposit_collected_cents) : 0,
          });
          setDbProperty({
            id: b.property_id,
            name: b.property_name,
            address: b.property_address || "",
            type: b.property_type === "short_term" ? "short-term" : "long-term",
            images: b.property_image ? [b.property_image] : [],
            houseRules: safeJsonArr(b.property_house_rules),
            checkInTime: b.check_in_time || undefined,
            checkOutTime: b.check_out_time || undefined,
          });
          try {
            const st = await fetchConnectStatus({ data: { companyId: b.company_id } });
            if (!cancelled) setConnect(st);
          } catch {
            /* connect status is best-effort — the pay buttons degrade gracefully */
          }
        } else if (!storeBooking) {
          setNotFound(true);
        }
      } catch {
        // DB unavailable — fall back to store (demo) resolution below.
        if (!storeBooking) setNotFound(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.bookingId, storeBooking]);

  // Merged view model: DB wins where present, store fills the gaps (demo).
  const booking: (Booking & Partial<PortalBooking>) | undefined = dbBooking
    ? { ...(storeBooking as Booking), ...dbBooking }
    : storeBooking;
  const property = dbProperty ? { ...storeProperty, ...dbProperty } : storeProperty;
  const guide = storeGuide;

  if (!booking || !property) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <div className="text-5xl mb-4">🏚️</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Booking Not Found</h1>
          <p className="text-gray-500 text-sm">
            {notFound ? "We couldn't find this reservation in our system. " : "We couldn't find this reservation. "}
            Please check your link or contact us at{" "}
            <a href={`${BASE_URL}/contact`} className="text-blue-600 underline">our contact page</a>.
          </p>
        </div>
      </div>
    );
  }

  const nights = Math.ceil((new Date(booking.endDate).getTime() - new Date(booking.startDate).getTime()) / 86400000);
  const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

  // ── Payment math (short-term policy: $500 non-refundable deposit per 7-day
  //    block due at booking; remainder due 30 days before check-in) ──
  const isShortTerm = property.type === "short-term";
  const totalCents = Math.round(booking.totalAmount * 100);
  const depositCents = depositFor(nights);
  const collected = Math.min(booking.depositCollectedCents || 0, totalCents);
  const depositPaidCents = Math.min(collected, depositCents);
  const depositDueCents = Math.max(0, depositCents - depositPaidCents);
  const balancePaidCents = Math.max(0, collected - depositCents);
  const balanceDueCents = Math.max(0, totalCents - depositCents - balancePaidCents);
  const balanceDue = balanceDueDate(booking.startDate);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="text-white py-8 px-4" style={{ background: `linear-gradient(135deg, ${BRAND} 0%, #1a5c7a 100%)` }}>
        <div className="max-w-2xl mx-auto text-center">
          {property.images && property.images.length > 0 ? (
          <img src={getImageSrc(property.images[0])} alt={property.name} className="w-full max-h-64 object-cover rounded-t-2xl -mx-4 -mt-8 mb-4" />
        ) : (
          <div className="text-4xl mb-2">🏘️</div>
        )}
          <p className="text-white/70 text-sm mb-1">Welcome, {booking.guestName}!</p>
          <h1 className="text-2xl font-bold">{property.name}</h1>
          <p className="text-white/80 text-sm mt-3">
            {fmt(booking.startDate)} – {fmt(booking.endDate)} · {nights} {nights === 1 ? "night" : "nights"}
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* ── Section 1: Quick-Access Cards ── */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Quick Access</h2>
          <div className="grid grid-cols-2 gap-3">
            <DoorCodeCard booking={booking} guide={guide} />
            <WifiCard network={guide?.wifiName} password={guide?.wifiPassword} />
            <QuickCard icon="🕐" label="Check-in" value={guide?.checkInTime || property.checkInTime || "3:00 PM"} />
            <QuickCard icon="🏁" label="Checkout" value={guide?.checkoutTime || property.checkOutTime || "11:00 AM"} />
          </div>
        </section>

        {/* ── Section 1b: Payment (short-term stays; deposit at booking, balance due 30d before check-in) ── */}
        {isShortTerm && (
          <PaymentCard
            bookingId={booking.id}
            propertyId={property.id}
            companyId={booking.companyId}
            isDemo={!!(connect && connect.isDemo) || !booking.companyId}
            onlineReady={!!(connect && !connect.isDemo && connect.onboardingComplete)}
            totalCents={totalCents}
            depositCents={depositCents}
            depositDueCents={depositDueCents}
            depositPaidCents={depositPaidCents}
            balanceDueCents={balanceDueCents}
            balanceDueDate={balanceDue}
          />
        )}
        {/* ── Section 2: House Rules (accordion) ── */}
        {guide?.houseRules && guide.houseRules.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">House Rules</h2>
            <AccordionItems items={guide.houseRules} />
          </section>
        )}

        {/* ── Section 3: Parking & Directions ── */}
        {(guide?.parkingInfo || guide?.directions) && (
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Parking & Directions</h2>
            <div className="space-y-3">
              {guide.parkingInfo && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">🅿️ Parking</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{guide.parkingInfo}</p>
                </div>
              )}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <p className="text-sm text-gray-600 mb-1 font-medium">{property.address}</p>
                {guide?.directions && <p className="text-sm text-gray-500 leading-relaxed mb-3">{guide.directions}</p>}
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(property.address)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-white rounded-lg px-4 py-2.5"
                  style={{ backgroundColor: BRAND }}
                >
                  📍 Open in Google Maps
                </a>
              </div>
            </div>
          </section>
        )}

        {/* ── Section 4: Digital Guidebook (by category) ── */}
        {guide?.localRecommendations && guide.localRecommendations.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Digital Guidebook</h2>
            <Guidebook recs={guide.localRecommendations} />
          </section>
        )}

        {/* ── Section 5: Report a Problem ── */}
        <ReportProblem
          booking={booking}
          property={property}
          guestEmail={booking.guestEmail}
          guestName={booking.guestName}
        />

        {/* ── Section 6: Message Us ── */}
        <MessageUs
          booking={booking}
          property={property}
          guestEmail={booking.guestEmail}
          guestName={booking.guestName}
        />

        {/* ── Section 7: Emergency Info ── */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">🆘 Emergency Information</h2>
          <div className="bg-red-50 border border-red-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">🚨</span>
              <span className="text-sm font-bold text-red-800">In an emergency, call 911 first.</span>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center py-2 border-b border-red-200">
                <span className="text-red-700 font-medium">{guide?.emergencyContact || "Property Manager"}</span>
                <a href={`tel:${(guide?.emergencyPhone || MANAGER_PHONE).replace(/[^0-9]/g, "")}`} className="font-bold text-red-900 bg-red-100 rounded-lg px-3 py-1.5">{guide?.emergencyPhone || MANAGER_PHONE}</a>
              </div>
              {guide?.nearestHospital && (
                <div className="py-2 border-b border-red-200">
                  <span className="text-red-700 font-medium">🏥 {guide.nearestHospital}</span>
                  {guide.nearestHospitalAddress && <p className="text-red-600 text-xs mt-1">{guide.nearestHospitalAddress}</p>}
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <a href="tel:911" className="flex-1 flex items-center justify-center gap-2 bg-red-600 text-white rounded-lg py-3 text-sm font-bold">🚑 Call 911</a>
                <a href={`tel:${(guide?.emergencyPhone || MANAGER_PHONE).replace(/[^0-9]/g, "")}`} className="flex-1 flex items-center justify-center gap-2 bg-white border-2 border-red-300 text-red-700 rounded-lg py-3 text-sm font-bold">📞 Manager</a>
              </div>
            </div>
          </div>
        </section>

        {/* ── Section 8: Checkout Instructions ── */}
        {guide?.checkoutInstructions && guide.checkoutInstructions.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">📋 Checkout Instructions</h2>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                <p className="text-xs text-gray-500">Checkout time: <strong className="text-gray-700">{guide?.checkoutTime || "11:00 AM"}</strong></p>
              </div>
              <ul className="divide-y divide-gray-50">
                {guide.checkoutInstructions.map((inst, i) => (
                  <li key={i} className="flex items-start gap-3 px-5 py-3.5 text-sm text-gray-700 min-h-[48px]">
                    <input type="checkbox" className="mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4" />
                    <span>{inst}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ── Footer ── */}
        <footer className="text-center py-6">
          <p className="text-xs text-gray-400">
            Powered by <span className="text-gray-500 font-medium">RentMore</span> · Guest Portal
          </p>
          <p className="text-xs text-gray-400 mt-1">
            <a href={`${BASE_URL}/contact?booking=${booking.id}`} className="underline">Contact Manager</a>
          </p>
        </footer>
      </main>
    </div>
  );
}
/* ─── Payment Card (deposit + balance, per payment-policy.ts) ─── */
function PaymentCard({
  bookingId,
  propertyId,
  companyId,
  isDemo,
  onlineReady,
  totalCents,
  depositCents,
  depositDueCents,
  depositPaidCents,
  balanceDueCents,
  balanceDueDate,
}: {
  bookingId: string;
  propertyId: string;
  companyId?: string;
  isDemo: boolean;
  onlineReady: boolean;
  totalCents: number;
  depositCents: number;
  depositDueCents: number;
  depositPaidCents: number;
  balanceDueCents: number;
  balanceDueDate: string;
}) {
  const [payMethod, setPayMethod] = useState<"card" | "ach">("card");
  const [payStep, setPayStep] = useState<"idle" | "starting" | "started" | "mock-done" | "error">("idle");
  const [payError, setPayError] = useState("");
  const [doneLabel, setDoneLabel] = useState("");
  const [notice, setNotice] = useState("");
  const fmtDate = (d: string) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

  // Return banners from hosted Checkout (?checkout=success | cancelled)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") setNotice("✅ Payment completed — thank you!");
    else if (params.get("checkout") === "cancelled") setNotice("Payment wasn't completed — you can try again below.");
  }, []);

  const startPayment = async (target: "deposit" | "balance") => {
    const amountCents = target === "deposit" ? depositDueCents : balanceDueCents;
    if (amountCents <= 0) return;
    setPayStep("starting");
    setPayError("");
    setNotice("");

    // Demo path — mock behavior so the demo portal stays demoable.
    if (isDemo) {
      setTimeout(() => {
        setDoneLabel(`${target === "deposit" ? "Deposit" : "Balance"} payment received (demo)`);
        setPayStep("mock-done");
      }, 1200);
      return;
    }
    // Real company that hasn't enabled online payments yet.
    if (!onlineReady) {
      setPayError("Online payments are being set up for this reservation — please try again soon, or contact the property manager.");
      setPayStep("idle");
      return;
    }
    try {
      const { createCheckoutSession } = await import("~/lib/db-queries");
      const res = await createCheckoutSession({
        data: {
          companyId: companyId!,
          bookingId,
          propertyId,
          amountCents,
          paymentType: target === "deposit" ? "deposit" : "charge",
          method: payMethod,
        },
      });
      if (res.mock || !res.url) {
        setDoneLabel("Payment received (demo mode)");
        setPayStep("mock-done");
        return;
      }
      window.open(res.url, "_blank", "noopener");
      setPayStep("started");
    } catch (e: any) {
      setPayError(e?.message || "Could not start the payment. Please try again or contact the property manager.");
      setPayStep("idle");
    }
  };

  const busy = payStep === "starting";
  const canPay = depositDueCents > 0 || balanceDueCents > 0;

  return (
    <section>
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">💳 Payment</h2>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 space-y-4">
          {notice && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800">{notice}</div>
          )}
          {payError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{payError}</div>
          )}
          {payStep === "started" && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
              💳 Secure checkout opened in a new tab — complete the payment there. We'll confirm it here once processed.
            </div>
          )}
          {payStep === "mock-done" && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800">
              ✅ {doneLabel} (demo mode — no real charge was made)
            </div>
          )}

          {/* Amount breakdown */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Reservation total</span>
              <span className="font-medium">{formatCurrency(totalCents / 100)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">
                Non-refundable deposit ({formatCurrency(DEPOSIT_PER_BLOCK_CENTS / 100)} per 7 nights)
              </span>
              <span className="font-medium">{formatCurrency(depositCents / 100)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Balance due {balanceDueDate ? `by ${fmtDate(balanceDueDate)}` : ""}</span>
              <span className="font-medium">{formatCurrency(balanceDueCents / 100)}</span>
            </div>
            {depositPaidCents > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Deposit paid</span>
                <span>{formatCurrency(depositPaidCents / 100)}</span>
              </div>
            )}
            <p className="text-xs text-gray-400 border-t border-gray-100 pt-2">
              Deposits are non-refundable; the balance is subject to the cancellation policy.
            </p>
          </div>

          {canPay && (
            <>
              {/* Method toggle */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setPayMethod("card")}
                  className={`p-3 border rounded-lg text-left transition-all ${payMethod === "card" ? "border-[#0f3c52] bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}
                >
                  <div className="text-xl mb-1">💳</div>
                  <p className="text-sm font-medium">Credit Card</p>
                  <p className="text-xs text-gray-400 mt-0.5">3.5% card convenience fee</p>
                </button>
                <button
                  onClick={() => setPayMethod("ach")}
                  className={`p-3 border rounded-lg text-left transition-all ${payMethod === "ach" ? "border-[#0f3c52] bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}
                >
                  <div className="text-xl mb-1">🏦</div>
                  <p className="text-sm font-medium">ACH Transfer</p>
                  <p className="text-xs text-gray-400 mt-0.5">1% + $0.25 ACH convenience fee</p>
                </button>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                {depositDueCents > 0 && (
                  <button
                    onClick={() => startPayment("deposit")}
                    disabled={busy}
                    className="w-full py-3 text-sm font-semibold text-white rounded-lg disabled:opacity-60"
                    style={{ backgroundColor: BRAND }}
                  >
                    {busy ? "Opening secure checkout…" : `Pay non-refundable deposit — ${formatCurrency(depositDueCents / 100)}`}
                  </button>
                )}
                {balanceDueCents > 0 && (
                  <button
                    onClick={() => startPayment("balance")}
                    disabled={busy}
                    className="w-full py-3 text-sm font-semibold rounded-lg border border-[#0f3c52] text-[#0f3c52] hover:bg-blue-50 disabled:opacity-60"
                  >
                    {busy ? "Opening secure checkout…" : `Pay remaining balance — ${formatCurrency(balanceDueCents / 100)}`}
                  </button>
                )}
              </div>
            </>
          )}

          {!canPay && (
            <p className="text-sm text-emerald-600 font-medium">✓ This reservation is fully paid.</p>
          )}
        </div>
      </div>
    </section>
  );
}

/* ─── Door Code Card (auto-generated from guest phone) ─── */
function DoorCodeCard({ booking, guide }: { booking?: Booking; guide?: PropertyGuide }) {
  const [revealed, setRevealed] = useState(false);
  const doorInfo = getGuestDoorCode(booking, guide);
  const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const now = new Date();
  const checkIn = new Date((booking?.startDate ?? "") + "T00:00:00");
  const checkOut = new Date((booking?.endDate ?? "") + "T23:59:59");
  const isBefore = now < checkIn;
  const isAfter = now > checkOut;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-left min-h-[80px]">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">🔑</span>
        <span className="text-xs font-medium text-gray-400 uppercase">Door Code</span>
      </div>
      {!doorInfo ? (
        <p className="text-sm text-gray-500">Contact your host for the door code</p>
      ) : isAfter ? (
        <p className="text-sm text-gray-500">Your stay has ended. Thank you for visiting!</p>
      ) : isBefore ? (
        <div>
          <p className="text-sm text-gray-700">
            Your code will be <span className="font-bold text-gray-900">{doorInfo.code}</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">Active from {fmt(booking!.startDate)}</p>
        </div>
      ) : (
        <button onClick={() => setRevealed(!revealed)} className="block w-full text-left">
          <p className={`text-lg font-bold ${revealed ? "text-gray-900" : "text-gray-300 tracking-[0.3em]"}`}>
            {revealed ? doorInfo.code : "•••••"}
          </p>
          <p className="text-xs text-gray-400 mt-1">{revealed ? "Tap to hide" : "Tap to reveal"}</p>
        </button>
      )}
      {guide?.masterDoorCode && (
        <p className="text-[10px] text-gray-400 mt-2 pt-2 border-t border-gray-100">
          Property manager master code: always active
        </p>
      )}
    </div>
  );
}

/* ─── Wi-Fi Card (tap to copy) ─── */
function WifiCard({ network, password }: { network?: string; password?: string }) {
  const [copied, setCopied] = useState(false);
  const text = network && password ? `${network} / ${password}` : (network || "—");

  function handleCopy() {
    if (!network || !password) return;
    navigator.clipboard.writeText(`Network: ${network}\nPassword: ${password}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <button
      onClick={handleCopy}
      className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-left active:bg-gray-50 transition-colors min-h-[80px]"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">📶</span>
        <span className="text-xs font-medium text-gray-400 uppercase">Wi-Fi</span>
      </div>
      {network ? (
        <>
          <p className="text-sm font-semibold text-gray-900">{network}</p>
          {password && <p className="text-xs text-gray-500 mt-0.5">Password: {password}</p>}
        </>
      ) : (
        <p className="text-sm text-gray-400">—</p>
      )}
      <p className="text-xs mt-1" style={{ color: copied ? "#059669" : "#9ca3af" }}>
        {copied ? "✓ Copied!" : "Tap to copy"}
      </p>
    </button>
  );
}

/* ─── Generic Quick Card ─── */
function QuickCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 min-h-[80px]">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <span className="text-xs font-medium text-gray-400 uppercase">{label}</span>
      </div>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

/* ─── Accordion Items ─── */
function AccordionItems({ items }: { items: string[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
      {items.map((item, i) => (
        <div key={i}>
          <button
            onClick={() => setOpenIdx(openIdx === i ? null : i)}
            className="w-full flex items-center justify-between px-5 py-4 text-left text-sm text-gray-700 font-medium min-h-[48px] hover:bg-gray-50 transition-colors"
          >
            <span className="flex items-center gap-3">
              <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs font-bold">{i + 1}</span>
              <span className="line-clamp-1">{item.length > 60 ? item.slice(0, 60) + "…" : item}</span>
            </span>
            <span className={`text-gray-300 transition-transform ${openIdx === i ? "rotate-180" : ""}`}>▼</span>
          </button>
          {openIdx === i && (
            <div className="px-5 pb-4 pt-1 text-sm text-gray-600 leading-relaxed bg-gray-50/50">
              {item}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Guidebook (by category) ─── */
function Guidebook({ recs }: { recs: { name: string; type: string; description: string; address?: string }[] }) {
  const cats = [
    { key: "Restaurant", icon: "🍽️", label: "Restaurants" },
    { key: "Fine Dining", icon: "🍷", label: "Fine Dining" },
    { key: "Breakfast", icon: "🥞", label: "Breakfast" },
    { key: "Attraction", icon: "🎯", label: "Attractions" },
    { key: "Beach", icon: "🏖️", label: "Beaches" },
    { key: "Hiking", icon: "🥾", label: "Hiking" },
    { key: "Ski Resort", icon: "⛷️", label: "Ski" },
    { key: "Grocery", icon: "🛒", label: "Groceries" },
    { key: "Shopping", icon: "🛍️", label: "Shopping" },
    { key: "Bike Rental", icon: "🚲", label: "Rentals" },
  ];

  const grouped: Record<string, typeof recs> = {};
  for (const r of recs) {
    const cat = cats.find(c => c.key === r.type || r.type.includes(c.key));
    const label = cat?.label || "Other";
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(r);
  }

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([label, items]) => (
        <div key={label}>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">{label}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {items.map((rec, i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <h4 className="font-semibold text-gray-900 text-sm">{rec.name}</h4>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{rec.description}</p>
                {rec.address && <p className="text-xs text-gray-400 mt-1">📍 {rec.address}</p>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Section 5: Report a Problem ─── */
const MAINT_CATEGORIES = [
  { value: "", label: "Select category…" },
  { value: "plumbing", label: "🚿 Plumbing" },
  { value: "appliance", label: "🔧 Appliance" },
  { value: "hvac", label: "❄️ HVAC" },
  { value: "electrical", label: "⚡ Electrical" },
  { value: "structural", label: "🏠 Structural" },
  { value: "general", label: "📋 Other" },
];

const URGENCY_LEVELS = [
  { value: "low", label: "Not urgent — whenever you can" },
  { value: "medium", label: "Needs attention soon" },
  { value: "high", label: "Important — please come today" },
  { value: "urgent", label: "🚨 Emergency — respond immediately" },
];

function ReportProblem({ booking, property, guestEmail, guestName }: {
  booking: { id: string; propertyId: string };
  property: { name: string; id: string };
  guestEmail: string;
  guestName: string;
}) {
  const [category, setCategory] = useState("");
  const [desc, setDesc] = useState("");
  const [urgency, setUrgency] = useState("medium");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [ticketId, setTicketId] = useState("");
  const [error, setError] = useState("");

  async function handleReport(e: React.FormEvent) {
    e.preventDefault();
    if (!desc.trim()) return;
    setSending(true);
    setError("");

    try {
      const classification = classifyMessage(category || "Maintenance issue", desc, guestName);
      // Override with user-selected category if they picked one
      const finalCategory = category || classification.maintenanceCategory || "general";
      const urgencyPriority = urgency as "low" | "medium" | "high" | "urgent";
      const catLabel = category
        ? MAINT_CATEGORIES.find(c => c.value === category)?.label?.replace(/[^a-zA-Z ]/g, "").trim() || category
        : classification.maintenanceCategory
          ? maintenanceCategoryLabel(classification.maintenanceCategory)
          : classification.details;

      const newTicketId = addMaintenanceRequest({
        propertyId: property.id,
        description: `${catLabel}: ${desc.slice(0, 80)}${desc.length > 80 ? "…" : ""}`,
        priority: urgencyPriority,
        status: "open",
        assignedTo: "Auto-assigned",
        dateReported: new Date().toISOString().slice(0, 10),
        cost: 0,
        chargedToOwner: false,
        reportedBy: guestName,
        reportedByEmail: guestEmail,
        category: finalCategory,
        sourceMessage: desc,
      });
      setTicketId(newTicketId);

      // Auto-reply
      const reply = generateAutoReply({ ...classification, suggestedPriority: urgencyPriority }, guestName, newTicketId);
      await queueEmail({
        to: guestEmail,
        toName: guestName,
        subject: reply.subject,
        html: autoReplyHtml(reply.body),
      });

      // Staff notification
      const staffNote = generateStaffNotification(
        { ...classification, suggestedPriority: urgencyPriority },
        guestName, guestEmail, "Maintenance issue", desc, property.name, newTicketId
      );
      if (staffNote) {
        await queueEmail({ to: MANAGER_EMAIL, toName: "Property Manager", subject: staffNote.subject, html: staffNote.html });
      }

      setSent(true);
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
    }
    setSending(false);
  }

  if (sent) {
    return (
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">🔧 Report a Problem</h2>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center">
          <div className="text-4xl mb-2">✅</div>
          <p className="text-sm font-semibold text-emerald-800">Problem reported!</p>
          {ticketId && <p className="text-sm text-emerald-700 mt-1">Maintenance ticket <strong>#{ticketId}</strong> has been created.</p>}
          <p className="text-xs text-emerald-600 mt-1">We've sent you a confirmation email and will address this shortly.</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">🔧 Report a Problem</h2>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <p className="text-sm text-gray-500 mb-4">Something not working? Let us know and we'll fix it ASAP.</p>
        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-xs text-red-700">{error}</div>}
        <form onSubmit={handleReport} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
            <select
              className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none"
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              {MAINT_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <textarea
              className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-900 placeholder-gray-400 resize-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none"
              rows={3}
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Describe the issue in detail…"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Urgency</label>
            <select
              className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none"
              value={urgency}
              onChange={e => setUrgency(e.target.value)}
            >
              {URGENCY_LEVELS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
          <button
            type="submit"
            disabled={sending}
            className="w-full py-3 rounded-lg text-white text-sm font-semibold min-h-[48px]"
            style={{ backgroundColor: sending ? "#6b7280" : BRAND }}
          >
            {sending ? "Submitting…" : "📨 Submit Report"}
          </button>
        </form>
      </div>
    </section>
  );
}

/* ─── Section 6: Message Us ─── */
function MessageUs({ booking, property, guestEmail, guestName }: {
  booking: { id: string; propertyId: string };
  property: { name: string };
  guestEmail: string;
  guestName: string;
}) {
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!msg.trim()) return;
    setSending(true);
    setError("");

    try {
      const result = await queueEmail({
        to: MANAGER_EMAIL,
        toName: "Property Manager",
        subject: `[Guest Message] ${guestName} — ${property.name}`,
        html: `<!DOCTYPE html>
<html><body style="font-family:sans-serif;color:#111827;">
<h2 style="color:${BRAND};">💬 New Guest Message</h2>
<table style="border-collapse:collapse;">
<tr><td style="padding:4px 12px;color:#6b7280;width:80px;">From</td><td style="padding:4px 12px;">${guestName} (${guestEmail})</td></tr>
<tr><td style="padding:4px 12px;color:#6b7280;">Property</td><td style="padding:4px 12px;">${property.name}</td></tr>
<tr><td style="padding:4px 12px;color:#6b7280;">Booking</td><td style="padding:4px 12px;"><a href="${BASE_URL}/guest/${booking.id}" style="color:${BRAND};">#${booking.id}</a></td></tr>
</table>
<hr style="border:0;border-top:1px solid #e5e7eb;margin:12px 0;">
<p style="color:#374151;white-space:pre-wrap;">${msg}</p>
</body></html>`,
      });

      if (result.success) setSent(true);
      else setError(result.error || "Failed to send. Please try again.");
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    }
    setSending(false);
  }

  if (sent) {
    return (
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">💬 Message Us</h2>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center">
          <div className="text-4xl mb-2">✅</div>
          <p className="text-sm font-semibold text-emerald-800">Message sent!</p>
          <p className="text-xs text-emerald-600 mt-1">We'll get back to you shortly.</p>
          <button onClick={() => setSent(false)} className="mt-3 text-xs text-emerald-700 underline min-h-[44px]">Send another message</button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">💬 Message Us</h2>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <p className="text-sm text-gray-500 mb-4">Have a question or need help? Drop us a message below.</p>
        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-xs text-red-700">{error}</div>}
        <form onSubmit={handleMessage} className="space-y-3">
          <textarea
            className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-900 placeholder-gray-400 resize-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none"
            rows={4}
            value={msg}
            onChange={e => setMsg(e.target.value)}
            placeholder="Type your message here…"
            required
          />
          <button
            type="submit"
            disabled={sending}
            className="w-full py-3 rounded-lg text-white text-sm font-semibold min-h-[48px]"
            style={{ backgroundColor: sending ? "#6b7280" : BRAND }}
          >
            {sending ? "Sending…" : "📩 Send Message"}
          </button>
        </form>
      </div>
    </section>
  );
}

function autoReplyHtml(body: string): string {
  return `<!DOCTYPE html>
<html><body style="font-family:sans-serif;background:#f4f5f7;padding:20px;">
<div style="max-width:500px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<div style="background:${BRAND};padding:20px;text-align:center;color:#fff;">
  <p style="margin:0;font-size:24px;">🏘️</p>
  <h1 style="margin:6px 0 0;font-size:18px;">Eastman Premier Rentals</h1>
</div>
<div style="padding:24px;color:#374151;font-size:14px;line-height:1.7;white-space:pre-wrap;">${body.replace(/\n/g, "<br>")}</div>
</div></body></html>`;
}

