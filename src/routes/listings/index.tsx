import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useStore } from "~/lib/store";
import type { Property } from "~/lib/data";

const BRAND = "#0f3c52";

export const Route = createFileRoute("/listings/")({
  component: ListingsPage,
});

function ListingsPage() {
  const store = useStore();
  const [search, setSearch] = useState("");
  const [bedrooms, setBedrooms] = useState("any");
  const [maxPrice, setMaxPrice] = useState("any");

  // Only short-term properties (or properties with nightly rates)
  const properties = useMemo(() => {
    return store.properties.filter((p) => {
      // Include if short-term or has a nightly rate from any booking
      if (p.type === "short-term") return true;
      const hasBooking = store.bookings.some((b) => b.propertyId === p.id && b.nightlyRate > 0);
      return hasBooking;
    });
  }, [store.properties, store.bookings]);

  const filtered = useMemo(() => {
    return properties.filter((p) => {
      const city = extractCity(p.address);
      if (search && !city.toLowerCase().includes(search.toLowerCase()) && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (bedrooms !== "any") {
        const b = parseInt(bedrooms);
        if (b === 4 && p.bedrooms < 4) return false;
        if (b < 4 && p.bedrooms !== b) return false;
      }
      if (maxPrice !== "any") {
        const rate = getNightlyRate(p, store.bookings);
        if (rate > parseInt(maxPrice)) return false;
      }
      return true;
    });
  }, [properties, search, bedrooms, maxPrice, store.bookings]);

  const uniqueCities = useMemo(() => {
    const cities = new Set(properties.map((p) => extractCity(p.address)));
    return Array.from(cities).sort();
  }, [properties]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="text-white py-4 px-4" style={{ backgroundColor: BRAND }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link to="/listings" className="text-xl font-bold">🏘️ Eastman Premier Rentals</Link>
          <a href="https://6cb00109005ce5add83d71c194d57d02.ctonew.app/contact" className="text-sm text-white/80 hover:text-white underline underline-offset-2">
            Contact
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="py-16 px-4 text-center" style={{ background: `linear-gradient(135deg, ${BRAND} 0%, #1a5c7a 50%, #2a7c9a 100%)` }}>
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">Find Your Perfect Stay</h1>
        <p className="text-white/70 text-lg max-w-xl mx-auto">
          Discover hand-picked vacation rentals across Southern California
        </p>
      </section>

      {/* Filters */}
      <section className="max-w-6xl mx-auto px-4 -mt-6 mb-8">
        <div className="bg-white rounded-xl shadow-lg p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-[#0f3c52] focus:ring-1 focus:ring-[#0f3c52] outline-none"
              placeholder="Search by city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Bedrooms</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-[#0f3c52] outline-none"
              value={bedrooms}
              onChange={(e) => setBedrooms(e.target.value)}
            >
              <option value="any">Any</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4+</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Max Price / Night</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-[#0f3c52] outline-none"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
            >
              <option value="any">Any</option>
              <option value="200">$200</option>
              <option value="300">$300</option>
              <option value="400">$400</option>
              <option value="500">$500</option>
              <option value="600">$600</option>
              <option value="700">$700+</option>
            </select>
          </div>
        </div>
      </section>

      {/* Property Grid */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🏠</div>
            <p className="text-gray-500 text-lg">No properties match your search.</p>
            <button
              onClick={() => { setSearch(""); setBedrooms("any"); setMaxPrice("any"); }}
              className="text-[#0f3c52] font-medium mt-2 hover:underline"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-400 mb-4">{filtered.length} {filtered.length === 1 ? "property" : "properties"} found</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((p) => (
                <PropertyCard key={p.id} property={p} store={store} />
              ))}
            </div>
          </>
        )}
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 text-center border-t border-gray-200">
        <p className="text-sm text-gray-400">© 2026 Eastman Premier Rentals</p>
      </footer>
    </div>
  );
}

function PropertyCard({ property, store }: { property: Property; store: ReturnType<typeof useStore> }) {
  const guide = store.propertyGuides.find((g) => g.propertyId === property.id);
  const rate = getNightlyRate(property, store.bookings);
  const city = extractCity(property.address);
  const heroImg = typeof property.images?.[0] === 'string' ? property.images[0] : property.images?.[0]?.url;

  return (
    <Link
      to="/listings/$propertyId"
      params={{ propertyId: property.id }}
      className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group"
    >
      {/* Image */}
      <div className="h-48 overflow-hidden">
        {heroImg ? (
          <img src={heroImg} alt={property.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${BRAND}00 0%, ${BRAND}40 100%)` }}>
            <span className="text-4xl opacity-50">🏘️</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-[#0f3c52] transition-colors">{property.name}</h3>
        <p className="text-sm text-gray-500 mb-3">{city}</p>
        <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
          <span>🛏 {property.bedrooms}</span>
          <span>🛁 {property.bathrooms}</span>
          <span>👤 {property.maxGuests}</span>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-lg font-bold" style={{ color: BRAND }}>
            ${rate}<span className="text-xs text-gray-400 font-normal">/night</span>
          </p>
          <span className="text-xs font-medium text-[#0f3c52] group-hover:underline">View Details →</span>
        </div>
      </div>
    </Link>
  );
}

/* ─── Helpers ─── */
function extractCity(address: string): string {
  const parts = address.split(",");
  return parts.length >= 2 ? parts[1].trim() : address;
}

function getNightlyRate(property: Property, bookings: ReturnType<typeof useStore>["bookings"]): number {
  if (property.nightlyRate && property.nightlyRate > 0) return property.nightlyRate;
  const propBookings = bookings
    .filter((b) => b.propertyId === property.id && b.nightlyRate > 0)
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  return propBookings[0]?.nightlyRate ?? property.monthlyRent / 30;
}
