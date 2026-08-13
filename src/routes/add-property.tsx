import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout } from "~/lib/layout";
import {
  type Property,
  type BedConfig,
  type BedType,
  type PetPolicy,
  type PropertySubtype,
  type PropertyImage,
} from "~/lib/data";
import { useStore } from "~/lib/store";
import { useSubscriptionStatus, PLAN_INACTIVE_MSG } from "~/lib/use-subscription";

export const Route = createFileRoute("/add-property")({
  component: AddPropertyPage,
});

// ── Constants ──

const BRAND = "#0f3c52";

const SUBTYPE_OPTIONS: { value: PropertySubtype | ""; label: string }[] = [
  { value: "", label: "Select subtype…" },
  { value: "house", label: "House" },
  { value: "apartment", label: "Apartment" },
  { value: "condo", label: "Condo" },
  { value: "townhouse", label: "Townhouse" },
  { value: "cabin", label: "Cabin" },
  { value: "villa", label: "Villa" },
  { value: "studio", label: "Studio" },
  { value: "loft", label: "Loft" },
  { value: "cottage", label: "Cottage" },
  { value: "other", label: "Other" },
];

const BED_TYPE_OPTIONS: { value: BedType; label: string }[] = [
  { value: "king", label: "King" },
  { value: "queen", label: "Queen" },
  { value: "double", label: "Double" },
  { value: "twin", label: "Twin" },
  { value: "bunk", label: "Bunk" },
  { value: "sofa_bed", label: "Sofa Bed" },
  { value: "crib", label: "Crib" },
];

const CANCELLATION_OPTIONS: { value: string; label: string; description: string }[] = [
  { value: "Flexible", label: "Flexible", description: "Full refund for cancellations made at least 24 hours before check-in. After that, the first night is non-refundable." },
  { value: "Moderate", label: "Moderate", description: "Full refund for cancellations made at least 5 days before check-in. After that, the first night is non-refundable." },
  { value: "Strict", label: "Strict", description: "Full refund for cancellations made at least 7 days before check-in. 50% refund for cancellations made between 2 and 7 days before check-in. No refund for cancellations made within 2 days of check-in." },
  { value: "Long Term", label: "Long Term", description: "Full refund for cancellations made within 48 hours of booking, as long as the check-in date is at least 28 days away. Otherwise, the first 30 nights are non-refundable." },
  { value: "Super Strict 30", label: "Super Strict 30", description: "50% refund for cancellations made at least 30 days before check-in. No refund after that." },
  { value: "Super Strict 60", label: "Super Strict 60", description: "50% refund for cancellations made at least 60 days before check-in. No refund after that." },
  { value: "Non-refundable", label: "Non-refundable", description: "No refunds for any reason." },
  { value: "Custom", label: "Custom", description: "Define your own cancellation terms in the details field below." },
];

const PET_OPTIONS: { value: PetPolicy | ""; label: string }[] = [
  { value: "", label: "Select policy…" },
  { value: "allowed", label: "Pets Allowed" },
  { value: "not_allowed", label: "Pets Not Allowed" },
  { value: "on_request", label: "On Request" },
  { value: "restrictions", label: "Restrictions Apply" },
];

// ── Amenity categories ──

interface AmenityGroup {
  label: string;
  items: string[];
}

const AMENITY_GROUPS: AmenityGroup[] = [
  {
    label: "Essentials",
    items: ["WiFi", "TV", "Kitchen", "Air conditioning", "Heating", "Washer", "Dryer", "Free parking on premises", "Hot tub", "Pool"],
  },
  {
    label: "Kitchen & Dining",
    items: ["Refrigerator", "Microwave", "Dishwasher", "Oven", "Stove", "Coffee maker", "Toaster", "Dishes & silverware", "Cooking basics"],
  },
  {
    label: "Bathroom",
    items: ["Hair dryer", "Shampoo", "Conditioner", "Body soap", "Hot water"],
  },
  {
    label: "Bedroom & Laundry",
    items: ["Bed linens", "Extra pillows & blankets", "Hangers", "Iron", "Clothing storage"],
  },
  {
    label: "Outdoor",
    items: ["Patio or balcony", "BBQ grill", "Fire pit", "Outdoor furniture", "Beach access"],
  },
  {
    label: "Safety",
    items: ["Smoke alarm", "Carbon monoxide alarm", "Fire extinguisher", "First aid kit"],
  },
  {
    label: "Accessibility",
    items: ["Step-free", "Wide doorway", "Accessible parking"],
  },
  {
    label: "Workspace",
    items: ["Dedicated workspace", "High-speed internet"],
  },
];

// ── Helper ──

const inputClass =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0f3c52]/30 focus:border-[#0f3c52]";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";
const sectionCard = "card p-6 space-y-4";
const sectionTitle =
  "text-lg font-semibold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-3 mb-2";

// ── Page ──

function AddPropertyPage() {
  const navigate = useNavigate();
  const { addProperty, owners, addOwner } = useStore();
  const sub = useSubscriptionStatus();

  const [saved, setSaved] = useState(false);
  const [savedId, setSavedId] = useState("");

  // Owner state
  const [useExistingOwner, setUseExistingOwner] = useState(true);
  const [newOwner, setNewOwner] = useState({ name: "", email: "", phone: "", street: "", city: "", state: "", zip: "" });

  // Form state
  const [form, setForm] = useState({
    name: "",
    address: "",
    type: "long-term" as Property["type"],
    propertySubtype: "" as PropertySubtype | "",
    floorLevel: "",
    monthlyRent: 0,
    nightlyRate: 0,
    weeklyRate: 0,
    deposit: 0,
    bedrooms: 1,
    bathrooms: 1,
    sqft: 0,
    maxGuests: 1,
    description: "",
    ownerId: owners[0]?.id ?? "",
    status: "vacant" as Property["status"],
    image: "",
    amenities: [] as string[],
    beds: [{ type: "queen", count: 1 }] as BedConfig[],
    checkInTime: "",
    checkOutTime: "",
    cancellationPolicy: "" as string,
    cancellationDetails: "",
    houseRules: [] as string[],
    minStay: undefined as number | undefined,
    maxStay: undefined as number | undefined,
    minimumAge: undefined as number | undefined,
    petPolicy: "" as PetPolicy | "",
    petPolicyDetails: "",
    images: [] as PropertyImage[],
  });

  const set = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // Bed helpers
  const addBed = () => {
    setForm((prev) => {
      const beds: BedConfig[] = [...prev.beds, { type: "queen", count: 1 }];
      return { ...prev, beds };
    });
  };
  const removeBed = (idx: number) =>
    setForm((prev) => ({
      ...prev,
      beds: prev.beds.filter((_, i) => i !== idx),
    }));
  const updateBed = (idx: number, field: keyof BedConfig, value: any) =>
    setForm((prev) => ({
      ...prev,
      beds: prev.beds.map((b, i) => (i === idx ? { ...b, [field]: value } : b)),
    }));

  // House rule helpers
  const addRule = () =>
    setForm((prev) => ({ ...prev, houseRules: [...prev.houseRules, ""] }));
  const removeRule = (idx: number) =>
    setForm((prev) => ({
      ...prev,
      houseRules: prev.houseRules.filter((_, i) => i !== idx),
    }));
  const updateRule = (idx: number, val: string) =>
    setForm((prev) => ({
      ...prev,
      houseRules: prev.houseRules.map((r, i) => (i === idx ? val : r)),
    }));

  // Image helpers
  const addImage = () =>
    setForm((prev) => ({
      ...prev,
      images: [...prev.images, { url: "", caption: "", room: "" }],
    }));
  const removeImage = (idx: number) =>
    setForm((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== idx),
    }));
  const updateImage = (idx: number, field: keyof PropertyImage, val: string) =>
    setForm((prev) => ({
      ...prev,
      images: prev.images.map((img, i) =>
        i === idx ? { ...img, [field]: val } : img
      ),
    }));

  // Amenity toggle
  const toggleAmenity = (item: string) => {
    setForm((prev) => {
      const has = prev.amenities.includes(item);
      const amenities = has
        ? prev.amenities.filter((a) => a !== item)
        : [...prev.amenities, item];
      return { ...prev, amenities };
    });
  };

  const handleSubmit = () => {
    // Hard client-side guard for the paywall (server re-checks in insertProperty)
    if (!sub.active) {
      navigate({ to: "/plan" });
      return;
    }
    // If creating a new owner, create a real Owner record first
    let ownerId = form.ownerId;
    if (!useExistingOwner && newOwner.name.trim()) {
      const created = addOwner({
        name: newOwner.name.trim(),
        email: newOwner.email.trim(),
        phone: newOwner.phone.trim(),
        tin: "",
        address: {
          street: newOwner.street.trim(),
          city: newOwner.city.trim(),
          state: newOwner.state.trim(),
          zip: newOwner.zip.trim(),
        },
        achInfo: { bankName: "", routingNumber: "", accountNumber: "" },
        propertyIds: [],
        createdAt: new Date().toISOString(),
      });
      ownerId = created.id;
    } else if (!useExistingOwner) {
      ownerId = `o-new-${Date.now()}`;
    }

    const data: Omit<Property, "id"> = {
      name: form.name,
      address: form.address,
      type: form.type,
      monthlyRent: Number(form.monthlyRent) || 0,
      nightlyRate: Number(form.nightlyRate) > 0 ? Number(form.nightlyRate) : undefined,
      weeklyRate: Number(form.weeklyRate) > 0 ? Number(form.weeklyRate) : undefined,
      deposit: Number(form.deposit) || 0,
      status: form.status,
      ownerId,
      image: form.image || undefined,
      bedrooms: Number(form.bedrooms) || 1,
      bathrooms: Number(form.bathrooms) || 1,
      sqft: Number(form.sqft) || 0,
      maxGuests: Number(form.maxGuests) || 1,
      description: form.description,
      amenities: form.amenities,
      propertySubtype: form.propertySubtype || undefined,
      floorLevel: form.floorLevel || undefined,
      beds: form.beds.length > 0 ? form.beds : undefined,
      checkInTime: form.checkInTime || undefined,
      checkOutTime: form.checkOutTime || undefined,
      cancellationPolicy: form.cancellationPolicy || undefined,
      cancellationDetails: form.cancellationDetails || undefined,
      houseRules: form.houseRules.length > 0 ? form.houseRules : undefined,
      minStay: form.minStay,
      maxStay: form.maxStay,
      minimumAge: form.minimumAge,
      petPolicy: form.petPolicy || undefined,
      petPolicyDetails: form.petPolicyDetails || undefined,
      images: form.images.length > 0 ? form.images : undefined,
    };

    const created = addProperty(data as any);
    setSavedId(created.id);
    setSaved(true);
  };

  if (saved) {
    return (
      <DashboardLayout currentPath="/add-property">
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="text-5xl">🎉</div>
          <h1 className="text-2xl font-bold text-gray-900">Property Added!</h1>
          <p className="text-gray-500">
            {form.name || "Your property"} has been created.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate({ to: `/properties/${savedId}` })}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ backgroundColor: BRAND }}
            >
              📋 View Listing Details
            </button>
            <button
              onClick={() => navigate({ to: "/properties" })}
              className="px-5 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              ← Back to Properties
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout currentPath="/add-property">
      <div className="space-y-6">
        {/* ── Header ── */}
        {!sub.active && !sub.loading && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 flex items-center justify-between gap-3 mb-6">
            <span><strong>Your plan is inactive.</strong> Renew to keep adding properties — existing data stays viewable.</span>
            <a href="/plan" className="shrink-0 font-medium underline">Choose a plan →</a>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <button
              onClick={() => navigate({ to: "/properties" })}
              className="text-sm text-gray-400 hover:text-[#0f3c52] mb-1 inline-flex items-center gap-1"
            >
              ← All Properties
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Add New Property</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Create a new property listing with OTA-ready details
            </p>
          </div>
          <button
            onClick={handleSubmit}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: BRAND }}
          >
            Create Property
          </button>
        </div>

        {/* ═══════════════ OWNER ═══════════════ */}
        <div className={sectionCard}>
          <h2 className={sectionTitle}>👤 Owner</h2>
          <div className="flex items-center gap-3 mb-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={useExistingOwner}
                onChange={() => setUseExistingOwner(true)}
              />
              Select existing owner
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={!useExistingOwner}
                onChange={() => setUseExistingOwner(false)}
              />
              Create new owner
            </label>
          </div>

          {useExistingOwner ? (
            <div>
              <label className={labelClass}>Owner</label>
              <select
                className={inputClass}
                value={form.ownerId}
                onChange={(e) => set("ownerId", e.target.value)}
              >
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} — {o.email}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Owner Name</label>
                  <input
                    className={inputClass}
                    placeholder="e.g. Jane Smith"
                    value={newOwner.name}
                    onChange={(e) =>
                      setNewOwner({ ...newOwner, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Email</label>
                  <input
                    className={inputClass}
                    type="email"
                    placeholder="owner@example.com"
                    value={newOwner.email}
                    onChange={(e) =>
                      setNewOwner({ ...newOwner, email: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Phone</label>
                  <input
                    className={inputClass}
                    placeholder="(555) 000-0000"
                    value={newOwner.phone}
                    onChange={(e) =>
                      setNewOwner({ ...newOwner, phone: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Mailing Address</label>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="md:col-span-2">
                    <input
                      className={inputClass}
                      placeholder="Street address"
                      value={newOwner.street}
                      onChange={(e) =>
                        setNewOwner({ ...newOwner, street: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <input
                      className={inputClass}
                      placeholder="City"
                      value={newOwner.city}
                      onChange={(e) =>
                        setNewOwner({ ...newOwner, city: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className={inputClass}
                      placeholder="State"
                      value={newOwner.state}
                      onChange={(e) =>
                        setNewOwner({ ...newOwner, state: e.target.value })
                      }
                    />
                    <input
                      className={inputClass}
                      placeholder="ZIP"
                      value={newOwner.zip}
                      onChange={(e) =>
                        setNewOwner({ ...newOwner, zip: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════ BASIC INFO ═══════════════ */}
        <div className={sectionCard}>
          <h2 className={sectionTitle}>📋 Basic Info</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Property Name *</label>
              <input
                className={inputClass}
                placeholder="e.g. Sunset Villa"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Address *</label>
              <input
                className={inputClass}
                placeholder="Full address"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Property Type</label>
              <select
                className={inputClass}
                value={form.type}
                onChange={(e) => set("type", e.target.value)}
              >
                <option value="long-term">Long-term</option>
                <option value="short-term">Short-term</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Property Subtype</label>
              <select
                className={inputClass}
                value={form.propertySubtype}
                onChange={(e) => set("propertySubtype", e.target.value)}
              >
                {SUBTYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Floor Level</label>
              <input
                className={inputClass}
                placeholder="e.g. 2nd floor, Ground"
                value={form.floorLevel}
                onChange={(e) => set("floorLevel", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select
                className={inputClass}
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
              >
                <option value="vacant">Vacant</option>
                <option value="occupied">Occupied</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <textarea
              className={inputClass}
              rows={3}
              placeholder="Describe the property…"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Cover Image URL</label>
            <input
              className={inputClass}
              placeholder="https://images.example.com/hero.jpg"
              value={form.image}
              onChange={(e) => set("image", e.target.value)}
            />
          </div>
        </div>

        {/* ═══════════════ RATES ═══════════════ */}
        <div className={sectionCard}>
          <h2 className={sectionTitle}>💰 Rates</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className={labelClass}>Nightly Rate ($)</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                value={form.nightlyRate}
                onChange={(e) => set("nightlyRate", Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelClass}>Weekly Rate ($)</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                value={form.weeklyRate}
                onChange={(e) => set("weeklyRate", Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelClass}>
                {form.type === "short-term" ? "Monthly Rate ($) (long stays)" : "Monthly Rent ($)"}
              </label>
              <input
                className={inputClass}
                type="number"
                min={0}
                value={form.monthlyRent}
                onChange={(e) => set("monthlyRent", Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelClass}>{form.type === "long-term" ? "Security Deposit ($)" : "Deposit ($)"}</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                value={form.deposit}
                onChange={(e) => set("deposit", Number(e.target.value))}
              />
              </div>
          </div>
        </div>

        {/* ═══════════════ ROOMS & BEDS ═══════════════ */}
        <div className={sectionCard}>
          <h2 className={sectionTitle}>🛏️ Rooms & Beds</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className={labelClass}>Bedrooms</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                value={form.bedrooms}
                onChange={(e) => set("bedrooms", Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelClass}>Bathrooms</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                step={0.5}
                value={form.bathrooms}
                onChange={(e) => set("bathrooms", Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelClass}>Square Footage</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                value={form.sqft}
                onChange={(e) => set("sqft", Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelClass}>Max Guests</label>
              <input
                className={inputClass}
                type="number"
                min={1}
                value={form.maxGuests}
                onChange={(e) => set("maxGuests", Number(e.target.value))}
              />
            </div>
          </div>

          {/* Bed configurator */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">Bed Configuration</p>
              <button
                type="button"
                onClick={addBed}
                className="text-xs px-3 py-1 rounded-lg font-medium border text-[#0f3c52] border-[#0f3c52]/20 hover:bg-[#0f3c52]/5 transition-colors"
              >
                + Add Bed
              </button>
            </div>
            {form.beds.length > 0 ? (
              <div className="space-y-2">
                {form.beds.map((bed, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2"
                  >
                    <span className="text-xs text-gray-400 font-mono w-6">
                      {i + 1}.
                    </span>
                    <select
                      className={`${inputClass} flex-1`}
                      value={bed.type}
                      onChange={(e) => updateBed(i, "type", e.target.value)}
                    >
                      {BED_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      className={`${inputClass} w-20`}
                      value={bed.count}
                      min={1}
                      onChange={(e) =>
                        updateBed(i, "count", Number(e.target.value))
                      }
                    />
                    <button
                      type="button"
                      onClick={() => removeBed(i)}
                      className="text-red-400 hover:text-red-600 text-sm px-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">
                No bed configurations added yet. Click "+ Add Bed" to start.
              </p>
            )}
          </div>
        </div>

        {/* ═══════════════ AMENITIES ═══════════════ */}
        <div className={sectionCard}>
          <h2 className={sectionTitle}>✨ Amenities</h2>
          <p className="text-sm text-gray-500 mb-4">
            Select all amenities available at this property. Selected:{" "}
            <strong>{form.amenities.length}</strong>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {AMENITY_GROUPS.map((group) => (
              <div key={group.label}>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  {group.label}
                </h3>
                <div className="space-y-1.5">
                  {group.items.map((item) => (
                    <label
                      key={item}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors text-sm ${
                        form.amenities.includes(item)
                          ? "bg-[#0f3c52]/5 text-[#0f3c52] font-medium"
                          : "hover:bg-gray-50 text-gray-600"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={form.amenities.includes(item)}
                        onChange={() => toggleAmenity(item)}
                        className="rounded border-gray-300 text-[#0f3c52] focus:ring-[#0f3c52]"
                      />
                      {item}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══════════════ POLICIES ═══════════════ */}
        <div className={sectionCard}>
          <h2 className={sectionTitle}>📜 Policies</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {form.type === "short-term" && (
              <div>
                <label className={labelClass}>Cancellation Policy</label>
                <select
                  className={inputClass}
                  value={form.cancellationPolicy}
                  onChange={(e) => set("cancellationPolicy", e.target.value)}
                >
                  <option value="">— Select —</option>
                  {CANCELLATION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <div className="mt-2 rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-1.5">
                  {CANCELLATION_OPTIONS.map((o) => (
                    <p
                      key={o.value}
                      className={`text-xs leading-relaxed ${
                        form.cancellationPolicy === o.value
                          ? "font-medium text-gray-800"
                          : "text-gray-500"
                      }`}
                    >
                      <span className="font-semibold">{o.label}:</span> {o.description}
                    </p>
                  ))}
                </div>
              </div>
              )}
            <div>
              <label className={labelClass}>Pet Policy</label>
              <select
                className={inputClass}
                value={form.petPolicy}
                onChange={(e) => set("petPolicy", e.target.value)}
              >
                {PET_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {form.type === "short-term" && (
            <div>
              <label className={labelClass}>Cancellation Details</label>
              <textarea
                className={inputClass}
                rows={3}
                placeholder="Detailed cancellation terms…"
                value={form.cancellationDetails}
                onChange={(e) => set("cancellationDetails", e.target.value)}
              />
            </div>
          )}

          {(form.petPolicy === "restrictions" ||
            form.petPolicy === "allowed" ||
            form.petPolicy === "on_request") && (
            <div>
              <label className={labelClass}>Pet Policy Details</label>
              <input
                className={inputClass}
                placeholder="e.g. Dogs under 50 lbs only, $75 fee"
                value={form.petPolicyDetails}
                onChange={(e) => set("petPolicyDetails", e.target.value)}
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Minimum Stay (nights)</label>
              <input
                className={inputClass}
                type="number"
                min={1}
                placeholder="e.g. 2"
                value={form.minStay ?? ""}
                onChange={(e) =>
                  set("minStay", e.target.value ? Number(e.target.value) : undefined)
                }
              />
            </div>
            <div>
              <label className={labelClass}>Maximum Stay (nights)</label>
              <input
                className={inputClass}
                type="number"
                min={1}
                placeholder="e.g. 30"
                value={form.maxStay ?? ""}
                onChange={(e) =>
                  set("maxStay", e.target.value ? Number(e.target.value) : undefined)
                }
              />
            </div>
            <div>
              <label className={labelClass}>Minimum Guest Age</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                placeholder="e.g. 18"
                value={form.minimumAge ?? ""}
                onChange={(e) =>
                  set(
                    "minimumAge",
                    e.target.value ? Number(e.target.value) : undefined
                  )
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Check-in Time</label>
              <input
                type="time"
                className={inputClass}
                value={form.checkInTime}
                onChange={(e) => set("checkInTime", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Check-out Time</label>
              <input
                type="time"
                className={inputClass}
                value={form.checkOutTime}
                onChange={(e) => set("checkOutTime", e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* ═══════════════ HOUSE RULES ═══════════════ */}
        <div className={sectionCard}>
          <div className="flex items-center justify-between">
            <h2 className={sectionTitle}>📏 House Rules</h2>
            <button
              type="button"
              onClick={addRule}
              className="text-xs px-3 py-1 rounded-lg font-medium border text-[#0f3c52] border-[#0f3c52]/20 hover:bg-[#0f3c52]/5 transition-colors"
            >
              + Add Rule
            </button>
          </div>

          {form.houseRules.length > 0 ? (
            <div className="space-y-2">
              {form.houseRules.map((rule, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 font-mono w-6">
                    {i + 1}.
                  </span>
                  <input
                    className={inputClass}
                    placeholder="e.g. No parties or events"
                    value={rule}
                    onChange={(e) => updateRule(i, e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeRule(i)}
                    className="text-red-400 hover:text-red-600 text-sm px-1"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">
              No house rules added yet.
            </p>
          )}
        </div>

        {/* ═══════════════ PHOTOS ═══════════════ */}
        <div className={sectionCard}>
          <div className="flex items-center justify-between">
            <h2 className={sectionTitle}>🖼️ Photos</h2>
            <button
              type="button"
              onClick={addImage}
              className="text-xs px-3 py-1 rounded-lg font-medium border text-[#0f3c52] border-[#0f3c52]/20 hover:bg-[#0f3c52]/5 transition-colors"
            >
              + Add Photo
            </button>
          </div>

          {form.images.length > 0 ? (
            <div className="space-y-4">
              {form.images.map((img, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-gray-50 rounded-lg"
                >
                  <div className="md:col-span-1">
                    <label className={labelClass}>Image URL</label>
                    <input
                      className={inputClass}
                      placeholder="https://images.example.com/room.jpg"
                      value={img.url}
                      onChange={(e) => updateImage(i, "url", e.target.value)}
                    />
                    {img.url && (
                      <img
                        src={img.url}
                        alt="Preview"
                        className="mt-2 w-full h-24 object-cover rounded-lg border border-gray-200"
                      />
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>Caption</label>
                    <input
                      className={inputClass}
                      placeholder="Describe this photo"
                      value={img.caption}
                      onChange={(e) =>
                        updateImage(i, "caption", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Room (optional)</label>
                    <input
                      className={inputClass}
                      placeholder="e.g. Living Room"
                      value={img.room ?? ""}
                      onChange={(e) => updateImage(i, "room", e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Remove Photo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">
              No photos added yet. Click "+ Add Photo" to add images.
            </p>
          )}
        </div>

        {/* ── Bottom bar ── */}
        <div className="flex items-center justify-between pb-8">
          <button
            onClick={() => navigate({ to: "/properties" })}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: BRAND }}
          >
            Create Property
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
