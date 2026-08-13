import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout } from "~/lib/layout";
import {
  getTenantsForProperty, getPaymentsForProperty,
  getMaintenanceForProperty,
  formatCurrency, getStatusColor, formatDate, getCancellationGuideline, type Property, type PropertyGuide,
} from "~/lib/data";
import { useStore } from "~/lib/store";
import { useSubscriptionStatus, PLAN_INACTIVE_MSG } from "~/lib/use-subscription";
import { PhotoUploader } from "~/lib/photo-upload";

type FilterType = "all" | "long-term" | "short-term";

export const Route = createFileRoute("/properties")({
  component: PropertiesPage,
});

function PropertiesPage() {
  const navigate = useNavigate();
  const { properties, addProperty, updateProperty, bookings, owners: storeOwners, propertyGuides, updatePropertyGuide } = useStore();
  const sub = useSubscriptionStatus();
  const [filter, setFilter] = useState<FilterType>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editProp, setEditProp] = useState<Property | null>(null);
  const [editForm, setEditForm] = useState<Partial<Property>>({});
  const [editSuccess, setEditSuccess] = useState(false);
  // Guide editor state
  const [guidePropId, setGuidePropId] = useState<string | null>(null);
  const [guideForm, setGuideForm] = useState<Partial<PropertyGuide>>({});
  const [guideSuccess, setGuideSuccess] = useState(false);
  const [showWifi, setShowWifi] = useState(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [guideImages, setGuideImages] = useState<(string | any)[]>([]);

  const SITE_URL = "https://rentmorevrs.com";

  const copyOnboardLink = (propertyId: string) => {
    const link = `${SITE_URL}/onboard/${propertyId}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopyToast(propertyId);
      setTimeout(() => setCopyToast(null), 2000);
    });
  };

  const openEdit = (p: Property) => { setEditProp(p); setEditForm({...p}); setEditSuccess(false); };
  const closeEdit = () => setEditProp(null);
  const openGuide = (propertyId: string) => {
    const existing = propertyGuides.find(g => g.propertyId === propertyId);
    const prop = properties.find(p => p.id === propertyId);
    setGuideForm(existing ? { ...existing } : { propertyId, doorCode: "", wifiName: "", wifiPassword: "", checkInTime: "3:00 PM", checkoutTime: "11:00 AM", parkingInfo: "", directions: "", houseRules: [], emergencyContact: "", emergencyPhone: "", nearestHospital: "", nearestHospitalAddress: "", localRecommendations: [], checkoutInstructions: [] });
    setGuideImages(prop?.images ?? []); // will be PropertyImage[]
    setGuidePropId(propertyId);
    setGuideSuccess(false);
    setShowWifi(false);
  };
  const closeGuide = () => setGuidePropId(null);
  const saveGuide = (e: React.FormEvent) => {
    e.preventDefault();
    if (guidePropId) {
      updatePropertyGuide(guidePropId, guideForm);
      updateProperty(guidePropId, { images: guideImages });
    }
    setGuideSuccess(true);
    setTimeout(() => { setGuidePropId(null); setGuideSuccess(false); }, 1200);
  };
  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editProp) updateProperty(editProp.id, editForm);
    setEditSuccess(true);
    setTimeout(closeEdit, 1200);
  };
  // Add Property now navigates to the full-page form at /add-property

  const filtered = filter === "all" ? properties : properties.filter(p => p.type === filter + "");
  const longTerm = properties.filter(p => p.type === "long-term");
  const shortTerm = properties.filter(p => p.type === "short-term");

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <DashboardLayout currentPath="/properties">
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
            <p className="mt-1 text-sm text-gray-500">Manage your {properties.length} properties</p>
          </div>
          {sub.active && !sub.loading ? (
            <a href="/add-property" className="btn-primary gap-2 inline-flex items-center">
              <span>+</span> Add Property
            </a>
          ) : (
            <button
              onClick={() => navigate({ to: "/plan" })}
              title={PLAN_INACTIVE_MSG}
              className="btn-primary gap-2 inline-flex items-center opacity-70"
              style={{ backgroundColor: "#0f3c52", color: "white" }}
            >
              <span>+</span> Add Property — Plan Required
            </button>
          )}
        </div>
        {!sub.active && !sub.loading && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 flex items-center justify-between gap-3">
            <span><strong>Your plan is inactive.</strong> Renew to keep adding properties — existing data stays viewable.</span>
            <a href="/plan" className="shrink-0 font-medium underline">Choose a plan →</a>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="stat-card">
            <p className="text-sm text-gray-500">Total Properties</p>
            <p className="text-3xl font-bold mt-1">{properties.length}</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-gray-500">Long-term</p>
            <p className="text-3xl font-bold mt-1">{longTerm.length}</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-gray-500">Short-term</p>
            <p className="text-3xl font-bold mt-1">{shortTerm.length}</p>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-2">
          {(["all", "long-term", "short-term"] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setExpandedId(null); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? "text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
              style={filter === f ? { backgroundColor: "#0f3c52" } : {}}
            >
              {f === "all" ? "All Properties" : f === "long-term" ? "Long-term" : "Short-term"}
            </button>
          ))}
        </div>

        {/* Properties list */}
        <div className="space-y-4">
          {filtered.map((property) => {
            const owner = storeOwners.find(o => o.id === property.ownerId);
            const propertyTenants = getTenantsForProperty(property.id);
            const propertyPayments = getPaymentsForProperty(property.id);
            const propertyMaintenance = getMaintenanceForProperty(property.id);
            const propertyBookings = bookings.filter(b => b.propertyId === property.id);
            const isExpanded = expandedId === property.id;

            return (
              <div key={property.id} className="card">
                {/* Clickable header row */}
                <div
                  className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggleExpand(property.id)}
                >
                  <div className="flex items-center gap-4">
                    {property.image && (
                      <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                        <img src={property.image} alt={property.name} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-gray-900">{property.name}</h3>
                      <p className="text-sm text-gray-500">{property.address}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`badge ${getStatusColor(property.type)}`}>{property.type}</span>
                    <span className={`badge ${getStatusColor(property.status)}`}>{property.status}</span>
                    <span className="text-sm font-semibold">{formatCurrency(property.monthlyRent)}</span>
                    <button onClick={(e) => { e.stopPropagation(); navigate({ to: `/properties/${property.id}` }); }} className="text-xs px-2 py-1 rounded-lg font-medium bg-[#0f3c52]/10 text-[#0f3c52] hover:bg-[#0f3c52]/20">📋 Listing Details</button>
                    <button onClick={(e) => { e.stopPropagation(); openEdit(property); }} className="text-xs px-2 py-1 rounded-lg font-medium bg-gray-100 text-gray-600 hover:bg-gray-200">✏️ Edit</button>
                    <button onClick={(e) => { e.stopPropagation(); openGuide(property.id); }} className="text-xs px-2 py-1 rounded-lg font-medium bg-gray-100 text-gray-600 hover:bg-gray-200">⚙️ Guest Portal</button>
                    <button onClick={(e) => { e.stopPropagation(); copyOnboardLink(property.id); }} className="text-xs px-2 py-1 rounded-lg font-medium bg-[#0f3c52]/10 text-[#0f3c52] hover:bg-[#0f3c52]/20 relative">
                      {copyToast === property.id ? "✅ Link copied!" : "📋 Send Onboarding"}
                    </button>
                    <span className="text-gray-400 transition-transform" style={{ transform: isExpanded ? "rotate(180deg)" : "" }}>
                      ▼
                    </span>
                  </div>
                </div>

                {/* Expanded detail section */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-6 py-4 space-y-6">
                    {/* Image gallery */}
                    {property.images && property.images.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {property.images.map((img: any, i: number) => (
                          <img key={i} src={typeof img === 'string' ? img : img.url} alt={`${property.name} ${i+1}`} className="w-40 h-28 rounded-lg object-cover flex-shrink-0" />
                        ))}
                      </div>
                    )}
                    {/* Description */}
                    <p className="text-sm text-gray-600">{property.description}</p>
                    {/* Key stats */}
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500">Bedrooms</p><p className="text-lg font-bold" style={{color:"#0f3c52"}}>{property.bedrooms}</p></div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500">Bathrooms</p><p className="text-lg font-bold" style={{color:"#0f3c52"}}>{property.bathrooms}</p></div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500">Sq Ft</p><p className="text-lg font-bold" style={{color:"#0f3c52"}}>{property.sqft.toLocaleString()}</p></div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500">Max Guests</p><p className="text-lg font-bold" style={{color:"#0f3c52"}}>{property.maxGuests}</p></div>
                      {property.type === "short-term" && property.nightlyRate && (
                        <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500">Nightly Rate</p><p className="text-lg font-bold" style={{color:"#0f3c52"}}>{formatCurrency(property.nightlyRate)}</p></div>
                      )}
                      <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500">Deposit</p><p className="text-lg font-bold" style={{color:"#0f3c52"}}>{formatCurrency(property.deposit)}</p></div>
                    </div>
                    {/* Amenities */}
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Amenities</p>
                      <div className="flex flex-wrap gap-1.5">{property.amenities.map(a => <span key={a} className="badge bg-green-50 text-green-700 text-xs">{a}</span>)}</div>
                    </div>
                    {/* Info grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div><p className="text-xs text-gray-500 uppercase tracking-wider">Owner</p><p className="text-sm font-medium mt-1">{owner?.name ?? "—"}</p><p className="text-xs text-gray-400">{owner?.email}</p>{owner?.phone && <p className="text-xs text-gray-400">{owner.phone}</p>}</div>
                      {owner?.address && (owner.address.street || owner.address.city) && (
                        <div><p className="text-xs text-gray-500 uppercase tracking-wider">Mailing Address</p><p className="text-xs text-gray-600 mt-1">{[owner.address.street, [owner.address.city, owner.address.state, owner.address.zip].filter(Boolean).join(", ")].filter(Boolean).join(", ")}</p></div>
                      )}
                      {owner?.achInfo?.bankName && (
                        <div><p className="text-xs text-gray-500 uppercase tracking-wider">ACH / Bank</p><p className="text-xs text-gray-600 mt-1">{owner.achInfo.bankName} · Acct {owner.achInfo.accountNumber?.slice(-4) || "—"}</p></div>
                      )}
                    </div>

                    {/* Tenants/Guests */}
                    {(propertyTenants.length > 0 || propertyBookings.length > 0) && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">
                          {property.type === "long-term" ? "Current Tenants" : "Bookings"}
                        </h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-gray-500">
                              <tr>
                                <th className="text-left px-4 py-2 font-medium">Name</th>
                                {property.type === "long-term" ? (
                                  <><th className="text-right px-4 py-2 font-medium">Rent</th><th className="text-left px-4 py-2 font-medium">Lease</th></>
                                ) : (
                                  <><th className="text-left px-4 py-2 font-medium">Dates</th><th className="text-right px-4 py-2 font-medium">Amount</th></>
                                )}
                                <th className="text-left px-4 py-2 font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {property.type === "long-term"
                                ? propertyTenants.map(t => (
                                    <tr key={t.id}>
                                      <td className="px-4 py-2 font-medium">{t.name}</td>
                                      <td className="px-4 py-2 text-right">{formatCurrency(t.rentAmount || 0)}</td>
                                      <td className="px-4 py-2 text-gray-500">{formatDate(t.leaseStart || "")} - {formatDate(t.leaseEnd || "")}</td>
                                      <td className="px-4 py-2"><span className="badge bg-green-100 text-green-800">Active</span></td>
                                    </tr>
                                  ))
                                : propertyBookings.filter(b => b.status !== "cancelled").map(b => (
                                    <tr key={b.id}>
                                      <td className="px-4 py-2 font-medium">{b.guestName}</td>
                                      <td className="px-4 py-2 text-gray-500">{formatDate(b.startDate)} — {formatDate(b.endDate)}</td>
                                      <td className="px-4 py-2 text-right">{formatCurrency(b.totalAmount)}</td>
                                      <td className="px-4 py-2"><span className={`badge ${getStatusColor(b.status)}`}>{b.status}</span></td>
                                    </tr>
                                  ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Recent Payments */}
                    {propertyPayments.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Recent Payments</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-gray-500">
                              <tr>
                                <th className="text-left px-4 py-2 font-medium">Description</th>
                                <th className="text-left px-4 py-2 font-medium">Date</th>
                                <th className="text-right px-4 py-2 font-medium">Amount</th>
                                <th className="text-left px-4 py-2 font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {propertyPayments.slice(0, 3).map(p => (
                                <tr key={p.id}>
                                  <td className="px-4 py-2">{p.description}</td>
                                  <td className="px-4 py-2 text-gray-500">{formatDate(p.date || p.dueDate)}</td>
                                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(p.amount)}</td>
                                  <td className="px-4 py-2"><span className={`badge ${getStatusColor(p.status)}`}>{p.status}</span></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Maintenance */}
                    {propertyMaintenance.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Maintenance Requests</h4>
                        <div className="space-y-2">
                          {propertyMaintenance.map(m => (
                            <div key={m.id} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-4 py-2">
                              <span>{m.description}</span>
                              <div className="flex items-center gap-2">
                                <span className={`badge ${getStatusColor(m.priority)}`}>{m.priority}</span>
                                <span className={`badge ${getStatusColor(m.status)}`}>{m.status}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <p className="text-lg">No properties match this filter</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Property Modal */}
      {editProp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !editSuccess && closeEdit()}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editSuccess ? "Saved! ✅" : `Edit ${editProp.name}`}</h2>
              <button onClick={closeEdit} className="text-gray-400 text-xl">&times;</button>
            </div>
            {editSuccess ? (
              <div className="p-12 text-center"><p className="text-lg font-medium text-green-600">Property updated!</p></div>
            ) : (
              <form onSubmit={saveEdit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><label className="block text-xs font-medium text-gray-700 mb-1">Name</label><input className="input-field text-sm" value={editForm.name||""} onChange={e=>setEditForm({...editForm,name:e.target.value})} /></div>
                  <div className="col-span-2"><label className="block text-xs font-medium text-gray-700 mb-1">Address</label><input className="input-field text-sm" value={editForm.address||""} onChange={e=>setEditForm({...editForm,address:e.target.value})} /></div>
                  <div><label className="block text-xs font-medium text-gray-700 mb-1">Type</label><select className="input-field text-sm" value={editForm.type||""} onChange={e=>setEditForm({...editForm,type:e.target.value as any})}><option value="short-term">Short-term</option><option value="long-term">Long-term</option></select></div>
                  <div><label className="block text-xs font-medium text-gray-700 mb-1">Status</label><select className="input-field text-sm" value={editForm.status||""} onChange={e=>setEditForm({...editForm,status:e.target.value as any})}><option value="occupied">Occupied</option><option value="vacant">Vacant</option></select></div>
                  <div><label className="block text-xs font-medium text-gray-700 mb-1">Bedrooms</label><input className="input-field text-sm" type="number" value={editForm.bedrooms||0} onChange={e=>setEditForm({...editForm,bedrooms:Number(e.target.value)})} /></div>
                  <div><label className="block text-xs font-medium text-gray-700 mb-1">Bathrooms</label><input className="input-field text-sm" type="number" step="0.5" value={editForm.bathrooms||0} onChange={e=>setEditForm({...editForm,bathrooms:Number(e.target.value)})} /></div>
                  <div><label className="block text-xs font-medium text-gray-700 mb-1">Monthly Rent ($)</label><input className="input-field text-sm" type="number" value={editForm.monthlyRent||0} onChange={e=>setEditForm({...editForm,monthlyRent:Number(e.target.value)})} /></div>
                  <div><label className="block text-xs font-medium text-gray-700 mb-1">Nightly Rate ($)</label><input className="input-field text-sm" type="number" value={editForm.nightlyRate||0} onChange={e=>setEditForm({...editForm,nightlyRate:Number(e.target.value)})} /></div>
                  <div><label className="block text-xs font-medium text-gray-700 mb-1">Weekly Rate ($)</label><input className="input-field text-sm" type="number" value={editForm.weeklyRate||0} onChange={e=>setEditForm({...editForm,weeklyRate:Number(e.target.value)})} /></div>
                  <div><label className="block text-xs font-medium text-gray-700 mb-1">{editForm.type === "long-term" ? "Security Deposit ($)" : "Deposit ($)"}</label><input className="input-field text-sm" type="number" value={editForm.deposit||0} onChange={e=>setEditForm({...editForm,deposit:Number(e.target.value)})} /></div>
                  {editForm.type === "short-term" && (
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Cancellation Policy</label>
                      <select className="input-field text-sm" value={editForm.cancellationPolicy||""} onChange={e=>setEditForm({...editForm,cancellationPolicy:e.target.value||undefined})}>
                        <option value="">— Select —</option>
                        <option value="Flexible">Flexible</option>
                        <option value="Moderate">Moderate</option>
                        <option value="Strict">Strict</option>
                        <option value="Long Term">Long Term</option>
                        <option value="Super Strict 30">Super Strict 30</option>
                        <option value="Super Strict 60">Super Strict 60</option>
                        <option value="Non-refundable">Non-refundable</option>
                        <option value="Custom">Custom</option>
                      </select>
                      {editForm.cancellationPolicy && (
                        <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                          <span className="font-medium text-gray-700">{editForm.cancellationPolicy}:</span>{" "}
                          {getCancellationGuideline(editForm.cancellationPolicy) || "Custom terms — see details below."}
                        </p>
                      )}
                    </div>
                  )}
                  {editForm.type === "short-term" && (
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Cancellation Details</label>
                      <textarea className="input-field text-sm" rows={2} value={editForm.cancellationDetails||""} onChange={e=>setEditForm({...editForm,cancellationDetails:e.target.value})} placeholder="e.g. Full refund 60 days prior; 50% refund 30–60 days; no refund within 30 days of check-in." />
                    </div>
                  )}
                  <div className="col-span-2"><label className="block text-xs font-medium text-gray-700 mb-1">Description</label><textarea className="input-field text-sm" rows={3} value={editForm.description||""} onChange={e=>setEditForm({...editForm,description:e.target.value})} /></div>
                </div>
                <div className="flex justify-end gap-3 pt-2"><button type="button" className="btn-secondary text-sm" onClick={closeEdit}>Cancel</button><button type="submit" className="btn-accent text-sm">Save Changes</button></div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Guest Portal Settings Modal */}
      {guidePropId && (() => {
        const prop = properties.find(p => p.id === guidePropId);
        const houseRules = guideForm.houseRules ?? [];
        const recs = guideForm.localRecommendations ?? [];
        const checkIns = guideForm.checkoutInstructions ?? [];
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !guideSuccess && closeGuide()}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-lg font-semibold">{guideSuccess ? "Saved! ✅" : `⚙️ Guest Portal: ${prop?.name || guidePropId}`}</h2>
              <button onClick={closeGuide} className="text-gray-400 text-xl">&times;</button>
            </div>
            {guideSuccess ? (
              <div className="p-12 text-center"><p className="text-lg font-medium text-green-600">Guest portal settings saved!</p></div>
            ) : (
              <form onSubmit={saveGuide} className="p-6 space-y-6">
                {/* Access & Connectivity */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">🔑 Access & Connectivity</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div><label className="block text-xs font-medium text-gray-700 mb-1">Door Code</label><input className="input-field text-sm" value={guideForm.doorCode ?? ""} onChange={e => setGuideForm({...guideForm, doorCode: e.target.value})} placeholder="e.g. #7756" /></div>
                    <div><label className="block text-xs font-medium text-gray-700 mb-1">🔑 Master Door Code</label><input className="input-field text-sm" value={guideForm.masterDoorCode ?? ""} onChange={e => setGuideForm({...guideForm, masterDoorCode: e.target.value})} placeholder="e.g. 0000#" /></div>
                    <div><label className="block text-xs font-medium text-gray-700 mb-1">📶 Wi-Fi Name</label><input className="input-field text-sm" value={guideForm.wifiName ?? ""} onChange={e => setGuideForm({...guideForm, wifiName: e.target.value})} placeholder="e.g. SunsetGuest" /></div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">📶 Wi-Fi Password</label>
                      <div className="flex gap-1">
                        <input className="input-field text-sm flex-1" type={showWifi ? "text" : "password"} value={guideForm.wifiPassword ?? ""} onChange={e => setGuideForm({...guideForm, wifiPassword: e.target.value})} placeholder="••••••" />
                        <button type="button" onClick={() => setShowWifi(!showWifi)} className="px-2 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50">{showWifi ? "🙈" : "👁"}</button>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Timing */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">🕐 Check-in / Check-out</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-medium text-gray-700 mb-1">Check-in Time</label><input className="input-field text-sm" value={guideForm.checkInTime ?? "3:00 PM"} onChange={e => setGuideForm({...guideForm, checkInTime: e.target.value})} /></div>
                    <div><label className="block text-xs font-medium text-gray-700 mb-1">Check-out Time</label><input className="input-field text-sm" value={guideForm.checkoutTime ?? "11:00 AM"} onChange={e => setGuideForm({...guideForm, checkoutTime: e.target.value})} /></div>
                  </div>
                </div>
                {/* Rules & Info */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">📋 Rules & Info</h3>
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-gray-700">House Rules</label>
                        <button type="button" onClick={() => setGuideForm({...guideForm, houseRules: [...houseRules, ""]})} className="text-xs text-[#0f3c52] hover:underline font-medium">+ Add Rule</button>
                      </div>
                      {houseRules.map((rule, i) => (
                        <div key={i} className="flex gap-1 mb-1">
                          <input className="input-field text-sm flex-1" value={rule} onChange={e => { const updated = [...houseRules]; updated[i] = e.target.value; setGuideForm({...guideForm, houseRules: updated}); }} placeholder="e.g. No smoking indoors" />
                          <button type="button" onClick={() => { const updated = houseRules.filter((_,j) => j !== i); setGuideForm({...guideForm, houseRules: updated}); }} className="text-red-400 hover:text-red-600 text-lg px-1">&times;</button>
                        </div>
                      ))}
                    </div>
                    <div><label className="block text-xs font-medium text-gray-700 mb-1">🅿️ Parking Info</label><input className="input-field text-sm" value={guideForm.parkingInfo ?? ""} onChange={e => setGuideForm({...guideForm, parkingInfo: e.target.value})} placeholder="e.g. 2 car driveway + street parking" /></div>
                    <div><label className="block text-xs font-medium text-gray-700 mb-1">🗺️ Directions</label><textarea className="input-field text-sm" rows={3} value={guideForm.directions ?? ""} onChange={e => setGuideForm({...guideForm, directions: e.target.value})} placeholder="e.g. From I-10, take exit 5... <iframe> for maps embed" /></div>
                  </div>
                </div>
                {/* Guidebook */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-800">📍 Local Recommendations</h3>
                    <button type="button" onClick={() => setGuideForm({...guideForm, localRecommendations: [...recs, { name: "", type: "restaurant", description: "", address: "" }]})} className="text-xs text-[#0f3c52] hover:underline font-medium">+ Add</button>
                  </div>
                  {recs.map((rec, i) => (
                    <div key={i} className="border border-gray-100 rounded-lg p-3 mb-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400 font-medium">#{i+1}</span>
                        <button type="button" onClick={() => { const updated = recs.filter((_,j) => j !== i); setGuideForm({...guideForm, localRecommendations: updated}); }} className="text-red-400 hover:text-red-600 text-sm">✕ Remove</button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div><label className="block text-[11px] font-medium text-gray-500 mb-0.5">Name</label><input className="input-field text-sm" value={rec.name} onChange={e => { const updated = [...recs]; updated[i] = {...updated[i], name: e.target.value}; setGuideForm({...guideForm, localRecommendations: updated}); }} placeholder="e.g. Hilltop Cafe" /></div>
                        <div><label className="block text-[11px] font-medium text-gray-500 mb-0.5">Category</label><select className="input-field text-sm" value={rec.type} onChange={e => { const updated = [...recs]; updated[i] = {...updated[i], type: e.target.value}; setGuideForm({...guideForm, localRecommendations: updated}); }}><option value="restaurant">🍽 Restaurant</option><option value="attraction">🎯 Attraction</option><option value="grocery">🛒 Grocery</option><option value="other">📌 Other</option></select></div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div><label className="block text-[11px] font-medium text-gray-500 mb-0.5">Description</label><input className="input-field text-sm" value={rec.description} onChange={e => { const updated = [...recs]; updated[i] = {...updated[i], description: e.target.value}; setGuideForm({...guideForm, localRecommendations: updated}); }} placeholder="Cozy brunch spot" /></div>
                        <div><label className="block text-[11px] font-medium text-gray-500 mb-0.5">Address</label><input className="input-field text-sm" value={rec.address ?? ""} onChange={e => { const updated = [...recs]; updated[i] = {...updated[i], address: e.target.value}; setGuideForm({...guideForm, localRecommendations: updated}); }} placeholder="e.g. 123 Main St" /></div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Checkout */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-semibold text-gray-800">🏁 Checkout Instructions</h3>
                    <button type="button" onClick={() => setGuideForm({...guideForm, checkoutInstructions: [...checkIns, ""]})} className="text-xs text-[#0f3c52] hover:underline font-medium">+ Add</button>
                  </div>
                  {checkIns.map((item, i) => (
                    <div key={i} className="flex gap-1 mb-1">
                      <input className="input-field text-sm flex-1" value={item} onChange={e => { const updated = [...checkIns]; updated[i] = e.target.value; setGuideForm({...guideForm, checkoutInstructions: updated}); }} placeholder="e.g. Leave keys on counter" />
                      <button type="button" onClick={() => { const updated = checkIns.filter((_,j) => j !== i); setGuideForm({...guideForm, checkoutInstructions: updated}); }} className="text-red-400 hover:text-red-600 text-lg px-1">&times;</button>
                    </div>
                  ))}
                </div>
                {/* Photos */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">🖼️ Property Photos</h3>
                  <PhotoUploader images={guideImages} onChange={setGuideImages} maxPhotos={20} />
                </div>
                {/* Emergency */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">🚨 Emergency Info</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-medium text-gray-700 mb-1">Emergency Contact</label><input className="input-field text-sm" value={guideForm.emergencyContact ?? ""} onChange={e => setGuideForm({...guideForm, emergencyContact: e.target.value})} placeholder="e.g. James (Manager)" /></div>
                    <div><label className="block text-xs font-medium text-gray-700 mb-1">Emergency Phone</label><input className="input-field text-sm" value={guideForm.emergencyPhone ?? ""} onChange={e => setGuideForm({...guideForm, emergencyPhone: e.target.value})} placeholder="e.g. (555) 123-4567" /></div>
                    <div><label className="block text-xs font-medium text-gray-700 mb-1">Nearest Hospital</label><input className="input-field text-sm" value={guideForm.nearestHospital ?? ""} onChange={e => setGuideForm({...guideForm, nearestHospital: e.target.value})} placeholder="e.g. St. John's Medical" /></div>
                    <div><label className="block text-xs font-medium text-gray-700 mb-1">Hospital Address</label><input className="input-field text-sm" value={guideForm.nearestHospitalAddress ?? ""} onChange={e => setGuideForm({...guideForm, nearestHospitalAddress: e.target.value})} placeholder="e.g. 123 Health Blvd" /></div>
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                  <button type="button" className="btn-secondary text-sm" onClick={closeGuide}>Cancel</button>
                  <button type="submit" className="btn-accent text-sm">💾 Save Settings</button>
                </div>
              </form>
            )}
          </div>
        </div>
        );
      })()}
    </DashboardLayout>
  );
}