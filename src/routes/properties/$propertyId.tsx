import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { DashboardLayout } from "~/lib/layout";
import {
  getImageSrc,
  formatCurrency,
  getCancellationGuideline,
  type Property,
  type BedConfig,
  type BedType,
  type PetPolicy,
  type PropertySubtype,
  type PropertyImage,
} from "~/lib/data";
import { useStore } from "~/lib/store";

export const Route = createFileRoute("/properties/$propertyId")({
  component: PropertyDetailPage,
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

const CANCELLATION_OPTIONS = [
  "Flexible",
  "Moderate",
  "Strict",
  "Long Term",
  "Super Strict 30",
  "Super Strict 60",
  "Non-refundable",
  "Custom",
];

const PET_OPTIONS: { value: PetPolicy | ""; label: string }[] = [
  { value: "", label: "Select policy…" },
  { value: "allowed", label: "Pets Allowed" },
  { value: "not_allowed", label: "Pets Not Allowed" },
  { value: "on_request", label: "On Request" },
  { value: "restrictions", label: "Restrictions Apply" },
];

// ── Helpers ──

const inputClass =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0f3c52]/30 focus:border-[#0f3c52]";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";
const sectionCard =
  "card p-6 space-y-4";
const sectionTitle =
  "text-lg font-semibold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-3 mb-2";

// ── Page ──

function PropertyDetailPage() {
  const params = Route.useParams();
  const navigate = useNavigate();
  const propertyId = params.propertyId;

  const { properties, updateProperty } = useStore();
  const property = properties.find((p) => p.id === propertyId);

  const [form, setForm] = useState<Property | null>(null);
  const [saved, setSaved] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Init form when property loads
  useEffect(() => {
    if (property) {
      setForm({ ...property });
      setNotFound(false);
    } else {
      setNotFound(true);
    }
  }, [propertyId, property?.id]);

  if (notFound) {
    return (
      <DashboardLayout currentPath="/properties">
        <div className="flex flex-col items-center justify-center py-20">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Property not found</h1>
          <p className="text-gray-500 mb-6">The property "{propertyId}" does not exist.</p>
          <button
            onClick={() => navigate({ to: "/properties" })}
            className="btn-primary"
          >
            ← Back to Properties
          </button>
        </div>
      </DashboardLayout>
    );
  }

  if (!form) {
    return (
      <DashboardLayout currentPath="/properties">
        <div className="flex items-center justify-center py-20">
          <p className="text-gray-400">Loading…</p>
        </div>
      </DashboardLayout>
    );
  }

  const set = (key: keyof Property, value: any) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = () => {
    if (form) {
      updateProperty(form.id, form);
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    }
  };

  // ── Bed helpers ──
  const addBed = () => {
    setForm((prev) => {
      if (!prev) return prev;
      const beds: BedConfig[] = prev.beds ? [...prev.beds] : [];
      beds.push({ type: "queen", count: 1 });
      return { ...prev, beds };
    });
  };

  const removeBed = (idx: number) => {
    setForm((prev) => {
      if (!prev || !prev.beds) return prev;
      const beds = prev.beds.filter((_, i) => i !== idx);
      return { ...prev, beds };
    });
  };

  const updateBed = (idx: number, field: keyof BedConfig, value: any) => {
    setForm((prev) => {
      if (!prev || !prev.beds) return prev;
      const beds = prev.beds.map((b, i) =>
        i === idx ? { ...b, [field]: value } : b
      );
      return { ...prev, beds };
    });
  };

  // ── House rules helpers ──
  const addRule = () => {
    setForm((prev) => {
      if (!prev) return prev;
      const houseRules = prev.houseRules ? [...prev.houseRules, ""] : [""];
      return { ...prev, houseRules };
    });
  };

  const removeRule = (idx: number) => {
    setForm((prev) => {
      if (!prev || !prev.houseRules) return prev;
      const houseRules = prev.houseRules.filter((_, i) => i !== idx);
      return { ...prev, houseRules };
    });
  };

  const updateRule = (idx: number, value: string) => {
    setForm((prev) => {
      if (!prev || !prev.houseRules) return prev;
      const houseRules = prev.houseRules.map((r, i) => (i === idx ? value : r));
      return { ...prev, houseRules };
    });
  };

  // ── Image helpers ──
  const updateImageCaption = (idx: number, caption: string) => {
    setForm((prev) => {
      if (!prev || !prev.images) return prev;
      const images = prev.images.map((img, i) => {
        const current = typeof img === "string" ? { url: img, caption: "" } : { ...img };
        if (i === idx) return { ...current, caption };
        return current;
      });
      return { ...prev, images };
    });
  };

  const updateImageRoom = (idx: number, room: string) => {
    setForm((prev) => {
      if (!prev || !prev.images) return prev;
      const images = prev.images.map((img, i) => {
        const current = typeof img === "string" ? { url: img, caption: "" } : { ...img };
        if (i === idx) return { ...current, room };
        return current;
      });
      return { ...prev, images };
    });
  };

  const getImages = (): PropertyImage[] => {
    if (!form || !form.images) return [];
    return form.images.map((img) =>
      typeof img === "string" ? { url: img, caption: "" } : img
    );
  };

  // ── Render ──

  const badges = (
    <div className="flex items-center gap-2">
      <span
        className="text-xs px-2 py-0.5 rounded-full font-medium text-white"
        style={{ backgroundColor: form.type === "short-term" ? "#f59e0b" : "#3b82f6" }}
      >
        {form.type}
      </span>
      <span
        className={`text-xs px-2 py-0.5 rounded-full font-medium text-white ${
          form.status === "occupied" ? "bg-red-400" : "bg-green-500"
        }`}
      >
        {form.status}
      </span>
      {form.propertySubtype && (
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">
          {form.propertySubtype}
        </span>
      )}
    </div>
  );

  return (
    <DashboardLayout currentPath="/properties">
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <button
              onClick={() => navigate({ to: "/properties" })}
              className="text-sm text-gray-400 hover:text-[#0f3c52] mb-1 inline-flex items-center gap-1"
            >
              ← All Properties
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{form.name}</h1>
              {badges}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{form.address}</p>
          </div>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="text-sm text-green-600 font-medium animate-pulse">
                ✓ Saved
              </span>
            )}
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90"
              style={{ backgroundColor: BRAND }}
            >
              Save Changes
            </button>
          </div>
        </div>

        {/* ═══════════════ BASIC INFO ═══════════════ */}
        <div className={sectionCard}>
          <h2 className={sectionTitle}>📋 Basic Info</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Property Name</label>
              <input
                type="text"
                className={inputClass}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Address</label>
              <input
                type="text"
                className={inputClass}
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
                value={form.propertySubtype ?? ""}
                onChange={(e) =>
                  set("propertySubtype", (e.target.value as PropertySubtype) || undefined)
                }
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
                type="text"
                className={inputClass}
                placeholder="e.g. 2nd floor, Ground"
                value={form.floorLevel ?? ""}
                onChange={(e) => set("floorLevel", e.target.value || undefined)}
              />
            </div>
            <div>
              <label className={labelClass}>Max Guests</label>
              <input
                type="number"
                className={inputClass}
                value={form.maxGuests}
                min={1}
                onChange={(e) => set("maxGuests", Number(e.target.value))}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea
              className={inputClass}
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className={labelClass}>Bedrooms</label>
              <input
                type="number"
                className={inputClass}
                value={form.bedrooms}
                min={0}
                onChange={(e) => set("bedrooms", Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelClass}>Bathrooms</label>
              <input
                type="number"
                className={inputClass}
                value={form.bathrooms}
                min={0}
                step={0.5}
                onChange={(e) => set("bathrooms", Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelClass}>Sq Ft</label>
              <input
                type="number"
                className={inputClass}
                value={form.sqft}
                min={0}
                onChange={(e) => set("sqft", Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelClass}>Nightly Rate ($)</label>
              <input
                type="number"
                className={inputClass}
                value={form.nightlyRate ?? 0}
                min={0}
                onChange={(e) => set("nightlyRate", Number(e.target.value) || undefined)}
              />
            </div>
            <div>
              <label className={labelClass}>Weekly Rate ($)</label>
              <input
                type="number"
                className={inputClass}
                value={form.weeklyRate ?? 0}
                min={0}
                onChange={(e) => set("weeklyRate", Number(e.target.value) || undefined)}
              />
            </div>
            <div>
              <label className={labelClass}>Monthly Rent ($)</label>
              <input
                type="number"
                className={inputClass}
                value={form.monthlyRent}
                min={0}
                onChange={(e) => set("monthlyRent", Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelClass}>{form.type === "long-term" ? "Security Deposit ($)" : "Deposit ($)"}</label>
              <input
                type="number"
                className={inputClass}
                value={form.deposit}
                min={0}
                onChange={(e) => set("deposit", Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        {/* ═══════════════ BEDS & ROOMS ═══════════════ */}
        <div className={sectionCard}>
          <h2 className={sectionTitle}>🛏️ Beds & Rooms</h2>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">Bed Configuration</p>
              <button
                onClick={addBed}
                className="text-xs px-3 py-1 rounded-lg font-medium border text-[#0f3c52] border-[#0f3c52]/20 hover:bg-[#0f3c52]/5 transition-colors"
              >
                + Add Bed
              </button>
            </div>

            {form.beds && form.beds.length > 0 ? (
              <div className="space-y-2">
                {form.beds.map((bed, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2"
                  >
                    <span className="text-xs text-gray-400 font-mono w-6">{i + 1}.</span>
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
                      onChange={(e) => updateBed(i, "count", Number(e.target.value))}
                    />
                    <button
                      onClick={() => removeBed(i)}
                      className="text-red-400 hover:text-red-600 text-sm px-1"
                      title="Remove bed"
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Check-in Time</label>
              <input
                type="time"
                className={inputClass}
                value={form.checkInTime ?? ""}
                onChange={(e) => set("checkInTime", e.target.value || undefined)}
              />
            </div>
            <div>
              <label className={labelClass}>Check-out Time</label>
              <input
                type="time"
                className={inputClass}
                value={form.checkOutTime ?? ""}
                onChange={(e) => set("checkOutTime", e.target.value || undefined)}
              />
            </div>
          </div>
        </div>

        {/* ═══════════════ POLICIES ═══════════════ */}
        <div className={sectionCard}>
          <h2 className={sectionTitle}>📜 Policies</h2>

          {form.type === "short-term" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Cancellation Policy</label>
              <select
                className={inputClass}
                value={form.cancellationPolicy ?? ""}
                onChange={(e) =>
                  set("cancellationPolicy", e.target.value || undefined)
                }
              >
                <option value="">— Select —</option>
                {CANCELLATION_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              {form.cancellationPolicy && (
                <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">
                  <span className="font-medium text-gray-700">{form.cancellationPolicy}:</span>{" "}
                  {getCancellationGuideline(form.cancellationPolicy) || "Custom terms — see details below."}
                </p>
              )}
            </div>
          </div>

          )}

          {form.type === "short-term" && (
          <div>
            <label className={labelClass}>Cancellation Details</label>
            <textarea
              className={inputClass}
              rows={3}
              placeholder="Detailed cancellation terms…"
              value={form.cancellationDetails ?? ""}
              onChange={(e) =>
                set("cancellationDetails", e.target.value || undefined)
              }
            />
          </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Minimum Stay (nights)</label>
              <input
                type="number"
                className={inputClass}
                value={form.minStay ?? ""}
                min={1}
                placeholder="e.g. 2"
                onChange={(e) =>
                  set(
                    "minStay",
                    e.target.value ? Number(e.target.value) : undefined
                  )
                }
              />
            </div>
            <div>
              <label className={labelClass}>Maximum Stay (nights)</label>
              <input
                type="number"
                className={inputClass}
                value={form.maxStay ?? ""}
                min={1}
                placeholder="e.g. 30"
                onChange={(e) =>
                  set(
                    "maxStay",
                    e.target.value ? Number(e.target.value) : undefined
                  )
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Pet Policy</label>
              <select
                className={inputClass}
                value={form.petPolicy ?? ""}
                onChange={(e) =>
                  set(
                    "petPolicy",
                    (e.target.value as PetPolicy) || undefined
                  )
                }
              >
                {PET_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {(form.petPolicy === "restrictions" ||
              form.petPolicy === "allowed" ||
              form.petPolicy === "on_request") && (
              <div>
                <label className={labelClass}>Pet Policy Details</label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="e.g. Dogs under 50 lbs only, $75 fee"
                  value={form.petPolicyDetails ?? ""}
                  onChange={(e) =>
                    set("petPolicyDetails", e.target.value || undefined)
                  }
                />
              </div>
            )}
          </div>

          {/* ── House Rules ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                House Rules
              </label>
              <button
                onClick={addRule}
                className="text-xs px-3 py-1 rounded-lg font-medium border text-[#0f3c52] border-[#0f3c52]/20 hover:bg-[#0f3c52]/5 transition-colors"
              >
                + Add Rule
              </button>
            </div>

            {form.houseRules && form.houseRules.length > 0 ? (
              <div className="space-y-2">
                {form.houseRules.map((rule, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-mono w-6">
                      {i + 1}.
                    </span>
                    <input
                      type="text"
                      className={inputClass}
                      placeholder="e.g. No parties or events"
                      value={rule}
                      onChange={(e) => updateRule(i, e.target.value)}
                    />
                    <button
                      onClick={() => removeRule(i)}
                      className="text-red-400 hover:text-red-600 text-sm px-1"
                      title="Remove rule"
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
        </div>

        {/* ═══════════════ PHOTOS ═══════════════ */}
        <div className={sectionCard}>
          <h2 className={sectionTitle}>🖼️ Photos & Captions</h2>

          {getImages().length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {getImages().map((img, i) => (
                <div
                  key={i}
                  className="border border-gray-100 rounded-lg overflow-hidden"
                >
                  <img
                    src={img.url}
                    alt={img.caption || `Photo ${i + 1}`}
                    className="w-full h-48 object-cover"
                  />
                  <div className="p-3 space-y-2 bg-gray-50">
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">
                        Caption
                      </label>
                      <input
                        type="text"
                        className={inputClass}
                        placeholder="Describe this photo"
                        value={img.caption ?? ""}
                        onChange={(e) => updateImageCaption(i, e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">
                        Room (optional)
                      </label>
                      <input
                        type="text"
                        className={inputClass}
                        placeholder="e.g. Living Room, Master Bedroom"
                        value={img.room ?? ""}
                        onChange={(e) => updateImageRoom(i, e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">
              No images uploaded for this property. Use the Photo Uploader on the
              Properties page to add images first.
            </p>
          )}
        </div>

        {/* ── Bottom save bar ── */}
        <div className="flex items-center justify-end gap-3 pb-8">
          {saved && (
            <span className="text-sm text-green-600 font-medium">
              ✓ Changes saved successfully
            </span>
          )}
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: BRAND }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
