import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useStore } from "~/lib/store";
import type { Property, PropertyGuide, Booking } from "~/lib/data";
import { getCancellationGuideline } from "~/lib/data";

const BRAND = "#0f3c52";

export const Route = createFileRoute("/listings/$propertyId")({
  component: PropertyDetailPage,
});

function PropertyDetailPage() {
  const params = Route.useParams() as { propertyId: string };
  const store = useStore();
  const property = store.properties.find((p) => p.id === params.propertyId);
  const guide = store.propertyGuides.find((g) => g.propertyId === params.propertyId);
  const bookings = store.bookings.filter((b) => b.propertyId === params.propertyId);
  const rate = getNightlyRate(property, bookings);
  const city = property ? extractCity(property.address) : "";

  if (!property) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <div className="text-5xl mb-4">🏚️</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Property Not Found</h1>
          <Link to="/listings" className="text-[#0f3c52] hover:underline">← Back to listings</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-8">
        {/* 1. Photo Gallery */}
        <PhotoGallery property={property} />

        {/* 2. Property Info */}
        <PropertyInfoSection property={property} guide={guide} rate={rate} city={city} />

        {/* 3. Amenities */}
        {guide?.amenityInfo && guide.amenityInfo.length > 0 && (
          <AmenitiesSection amenities={guide.amenityInfo} />
        )}
        {/* 4. House Rules */}
        {(property.houseRules && property.houseRules.length > 0) && (
          <HouseRulesSection rules={property.houseRules} />
        )}
        {guide?.houseRules && guide.houseRules.length > 0 && !property.houseRules?.length && (
          <HouseRulesSection rules={guide.houseRules} />
        )}
        {/* 4b. Cancellation Policy */}
        {property.type === "short-term" && property.cancellationPolicy && (
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-4">📜 Cancellation Policy</h2>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <p className="font-semibold text-gray-900">{property.cancellationPolicy}</p>
              <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">
                {property.cancellationDetails || getCancellationGuideline(property.cancellationPolicy)}
              </p>
            </div>
          </section>
        )}
        {/* 5. Availability Calendar */}
        <AvailabilitySection bookings={bookings} />
        <AvailabilitySection bookings={bookings} />

        {/* 6. Recommendations */}
        {guide?.localRecommendations && guide.localRecommendations.length > 0 && (
          <RecommendationsSection recs={guide.localRecommendations} />
        )}

        {/* 7. CTA */}
        <div className="text-center py-4">
          <a
            href="/contact"
            className="inline-block px-8 py-3 text-lg font-semibold text-white rounded-xl hover:opacity-90 transition-opacity"
            style={{ backgroundColor: BRAND }}
          >
            📅 Check Availability
          </a>
        </div>

        {/* 8. Emergency Info (collapsed) */}
        <EmergencySection guide={guide} />
      </main>

      <footer className="py-8 px-4 text-center border-t border-gray-200">
        <p className="text-sm text-gray-400">© 2026 Eastman Premier Rentals</p>
      </footer>
    </div>
  );
}

/* ─── Header ─── */
function Header() {
  return (
    <header className="text-white py-4 px-4" style={{ backgroundColor: BRAND }}>
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <Link to="/listings" className="text-xl font-bold">🏘️ Eastman Premier Rentals</Link>
        <a href="https://6cb00109005ce5add83d71c194d57d02.ctonew.app/contact" className="text-sm text-white/80 hover:text-white underline underline-offset-2">
          Contact
        </a>
      </div>
    </header>
  );
}

/* ─── Photo Gallery ─── */
function PhotoGallery({ property }: { property: Property }) {
  const images: any[] = property.images ?? [];
  const [selected, setSelected] = useState(0);

  if (images.length === 0) {
    return (
      <div className="h-64 sm:h-96 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${BRAND}20 0%, ${BRAND}40 100%)` }}>
        <span className="text-5xl opacity-40">🏘️</span>
      </div>
    );
  }

  return (
    <div>
      {/* Hero */}
      <div className="rounded-xl overflow-hidden h-64 sm:h-96">
        <img src={typeof images[selected] === 'string' ? images[selected] : images[selected]?.url} alt={property.name} className="w-full h-full object-cover" />
      </div>
      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-2 mt-3 overflow-x-auto pb-2">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setSelected(i)}
              className={`flex-shrink-0 w-20 h-16 rounded-lg overflow-hidden border-2 transition-all ${i === selected ? "border-[#0f3c52] opacity-100" : "border-transparent opacity-60 hover:opacity-90"}`}
            >
              <img src={typeof img === 'string' ? img : img?.url} alt={`${property.name} ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Property Info ─── */
function PropertyInfoSection({ property, guide, rate, city }: { property: Property; guide?: PropertyGuide; rate: number; city: string }) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{property.name}</h1>
          <p className="text-gray-500 mt-1">{property.address}</p>
          {property.description && (
            <p className="text-sm text-gray-600 mt-3 leading-relaxed">{property.description}</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-3xl font-bold" style={{ color: BRAND }}>${rate}</p>
          <p className="text-xs text-gray-400">per night</p>
          {property.weeklyRate && property.weeklyRate > 0 && (
            <p className="text-sm text-gray-500 mt-1">${property.weeklyRate}/week</p>
          )}
          {property.monthlyRent && property.monthlyRent > 0 && (
            <p className="text-sm text-gray-500">${property.monthlyRent}/mo</p>
          )}
            {property.type === "long-term" && property.deposit && property.deposit > 0 && (
              <p className="text-sm text-gray-500 mt-1">Security deposit: ${property.deposit.toLocaleString()}</p>
            )}
        </div>
      </div>
      <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-100">
        <InfoBadge label="Bedrooms" value={property.bedrooms} icon="🛏" />
        <InfoBadge label="Bathrooms" value={property.bathrooms} icon="🛁" />
        <InfoBadge label="Guests" value={property.maxGuests} icon="👤" />
        <InfoBadge label="Sq Ft" value={property.sqft} icon="📐" />
        {guide?.checkInTime && <InfoBadge label="Check-in" value={guide.checkInTime} icon="🕐" />}
        {guide?.checkoutTime && <InfoBadge label="Check-out" value={guide.checkoutTime} icon="🏁" />}
      </div>
    </section>
  );
}

function InfoBadge({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
      <span className="text-lg">{icon}</span>
      <div>
        <p className="text-[10px] text-gray-400 uppercase">{label}</p>
        <p className="text-sm font-semibold text-gray-700">{value}</p>
      </div>
    </div>
  );
}

/* ─── Amenities ─── */
function AmenitiesSection({ amenities }: { amenities: { name: string; accessInfo: string }[] }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-gray-900 mb-4">✨ Amenities</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {amenities.map((a, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="font-semibold text-gray-900 text-sm">{a.name}</p>
            {a.accessInfo && <p className="text-xs text-gray-500 mt-1">{a.accessInfo}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── House Rules ─── */
function HouseRulesSection({ rules }: { rules: string[] }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-gray-900 mb-4">📋 House Rules</h2>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <ul className="space-y-2">
          {rules.map((rule, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
              <span className="text-gray-300 mt-0.5">•</span>
              {rule}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ─── Availability Calendar ─── */
function AvailabilitySection({ bookings }: { bookings: Booking[] }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  };

  // Build booked date set
  const bookedDates = useMemo(() => {
    const set = new Set<string>();
    bookings.forEach((b) => {
      const start = new Date(b.startDate + "T00:00:00");
      const end = new Date(b.endDate + "T00:00:00");
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        set.add(d.toISOString().slice(0, 10));
      }
    });
    return set;
  }, [bookings]);

  const monthName = new Date(year, month).toLocaleString("en-US", { month: "long" });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  return (
    <section>
      <h2 className="text-lg font-bold text-gray-900 mb-4">📅 Availability</h2>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="text-gray-400 hover:text-gray-700 text-lg">←</button>
          <h3 className="font-semibold text-gray-900">{monthName} {year}</h3>
          <button onClick={nextMonth} className="text-gray-400 hover:text-gray-700 text-lg">→</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-[10px] font-medium text-gray-400 uppercase py-1">{d}</div>
          ))}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`e${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isBooked = bookedDates.has(dateStr);
            const isPast = new Date(dateStr) < new Date(now.toISOString().slice(0, 10));
            return (
              <div
                key={day}
                className={`text-xs py-2 rounded ${isBooked ? "bg-red-100 text-red-600" : isPast ? "text-gray-300" : "bg-green-50 text-green-700 font-medium"}`}
                title={isBooked ? "Booked" : isPast ? "Past" : "Available"}
              >
                {day}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-50 border border-green-200 inline-block" /> Available</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-200 inline-block" /> Booked</span>
        </div>
      </div>
    </section>
  );
}

/* ─── Recommendations ─── */
function RecommendationsSection({ recs }: { recs: { name: string; type: string; description: string; address?: string }[] }) {
  const typeIcons: Record<string, string> = { restaurant: "🍽", attraction: "🎯", grocery: "🛒", other: "📌" };
  return (
    <section>
      <h2 className="text-lg font-bold text-gray-900 mb-4">📍 Nearby Recommendations</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {recs.map((r, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-1">
              <span>{typeIcons[r.type] || "📌"}</span>
              <p className="font-semibold text-gray-900 text-sm">{r.name}</p>
            </div>
            {r.description && <p className="text-xs text-gray-500 mb-1">{r.description}</p>}
            {r.address && <p className="text-[10px] text-gray-400">{r.address}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Emergency Info ─── */
function EmergencySection({ guide }: { guide?: PropertyGuide }) {
  const [open, setOpen] = useState(false);
  if (!guide?.emergencyContact && !guide?.nearestHospital) return null;

  return (
    <section className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="font-semibold text-gray-700">🚨 Emergency Information</span>
        <span className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="p-4 space-y-3 bg-white">
          {guide.emergencyContact && (
            <div>
              <p className="text-xs text-gray-400 uppercase">Emergency Contact</p>
              <p className="text-sm font-medium text-gray-900">{guide.emergencyContact}</p>
              {guide.emergencyPhone && <p className="text-sm text-gray-600">{guide.emergencyPhone}</p>}
            </div>
          )}
          {guide.nearestHospital && (
            <div>
              <p className="text-xs text-gray-400 uppercase">Nearest Hospital</p>
              <p className="text-sm font-medium text-gray-900">{guide.nearestHospital}</p>
              {guide.nearestHospitalAddress && <p className="text-sm text-gray-600">{guide.nearestHospitalAddress}</p>}
            </div>
          )}
          {guide.policeNonEmergency && (
            <div>
              <p className="text-xs text-gray-400 uppercase">Police (Non-Emergency)</p>
              <p className="text-sm text-gray-600">{guide.policeNonEmergency}</p>
            </div>
          )}
          {guide.fireDepartment && (
            <div>
              <p className="text-xs text-gray-400 uppercase">Fire Department</p>
              <p className="text-sm text-gray-600">{guide.fireDepartment}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ─── Helpers ─── */
function extractCity(address: string): string {
  const parts = address.split(",");
  return parts.length >= 2 ? parts[1].trim() : address;
}

function getNightlyRate(property: Property, bookings: Booking[]): number {
  if (property.nightlyRate && property.nightlyRate > 0) return property.nightlyRate;
  const propBookings = bookings
    .filter((b) => b.nightlyRate > 0)
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  return Math.round(propBookings[0]?.nightlyRate ?? property.monthlyRent / 30);
}
