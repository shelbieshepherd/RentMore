import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout } from "~/lib/layout";
import { type Owner, formatDate, formatCurrency } from "~/lib/data";
import { useStore } from "~/lib/store";

export const Route = createFileRoute("/owners")({
  component: OwnersPage,
});

// Display only last 4 digits of account number
function maskAccount(num: string): string {
  return num.length >= 4 ? `••••${num.slice(-4)}` : "••••";
}

const emptyOwner: Omit<Owner, "id" | "createdAt" | "propertyIds"> = {
  name: "", email: "", phone: "",
  address: { street: "", city: "", state: "", zip: "" },
  achInfo: { bankName: "", routingNumber: "", accountNumber: "" },
  payoutMethod: "ACH",
};

function OwnersPage() {
  const { owners, properties, addOwner, updateOwner, deleteOwner, ownerCharges, addOwnerCharge, maintenanceRequests } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [editOwner, setEditOwner] = useState<Owner | null>(null);
  const [form, setForm] = useState<typeof emptyOwner>({ ...emptyOwner });
  const [success, setSuccess] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Charge modal
  const [chargeOwnerId, setChargeOwnerId] = useState<string | null>(null);
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeDesc, setChargeDesc] = useState("");
  const [chargeMaintId, setChargeMaintId] = useState("");
  const [chargeSuccess, setChargeSuccess] = useState(false);

  const ownerPropertyCount = (ownerId: string) =>
    properties.filter(p => p.ownerId === ownerId).length;

  const ownerProperties = (ownerId: string) =>
    properties.filter(p => p.ownerId === ownerId);

  const openAdd = () => {
    setForm({ ...emptyOwner });
    setSuccess(false);
    setShowAdd(true);
  };

  const openEdit = (o: Owner) => {
    setEditOwner(o);
    setForm({
      name: o.name,
      email: o.email,
      phone: o.phone,
      address: { ...o.address },
      achInfo: { ...o.achInfo },
      payoutMethod: o.payoutMethod || "ACH",
    });
    setSuccess(false);
  };

  const closeModal = () => {
    setShowAdd(false);
    setEditOwner(null);
    setSuccess(false);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (editOwner) {
      updateOwner(editOwner.id, form as Partial<Owner>);
    } else {
      addOwner(form);
    }
    setSuccess(true);
    setTimeout(closeModal, 1200);
  };

  const handleDelete = (id: string) => {
    setConfirmDelete(id);
  };

  const confirmDeleteOwner = async () => {
    if (!confirmDelete) return;
    const res = await deleteOwner(confirmDelete);
    if (res && !res.ok) {
      // DB refused (owner has recorded payouts) — show the reason and keep the row.
      alert(res.error || "This owner could not be deleted.");
      setConfirmDelete(null);
      return;
    }
    setConfirmDelete(null);
  };

  const handleCharge = (ownerId: string) => {
    setChargeOwnerId(ownerId);
    setChargeAmount("");
    setChargeDesc("");
    setChargeMaintId("");
    setChargeSuccess(false);
  };

  const submitCharge = () => {
    if (!chargeOwnerId || !chargeAmount || !chargeDesc.trim()) return;
    const dollars = parseFloat(chargeAmount);
    if (isNaN(dollars) || dollars <= 0) return;
    addOwnerCharge({
      ownerId: chargeOwnerId,
      amount: Math.round(dollars * 100),
      description: chargeDesc.trim(),
      maintenanceRequestId: chargeMaintId || undefined,
      date: new Date().toISOString().slice(0, 10),
      status: "success",
    });
    setChargeSuccess(true);
    setTimeout(() => { setChargeOwnerId(null); setChargeSuccess(false); }, 1500);
  };

  const getOpenMaintForOwner = (ownerId: string) => {
    const ownerPropIds = properties.filter(p => p.ownerId === ownerId).map(p => p.id);
    return maintenanceRequests.filter(m =>
      ownerPropIds.includes(m.propertyId) && m.status !== "resolved"
    );
  };

  const getOwnerChargesFor = (ownerId: string) =>
    ownerCharges.filter(c => c.ownerId === ownerId).sort((a, b) => b.date.localeCompare(a.date));

  const getMaintDesc = (maintId?: string) => {
    if (!maintId) return null;
    return maintenanceRequests.find(m => m.id === maintId)?.description ?? maintId;
  };

  const isOpen = showAdd || !!editOwner;

  return (
    <DashboardLayout currentPath="/owners">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Owners</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage {owners.length} property owner{owners.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button onClick={openAdd} className="btn-accent gap-1.5">
            <span className="text-lg leading-none">+</span>
            <span>Add Owner</span>
          </button>
        </div>

        {/* Empty state */}
        {owners.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm">
            <div className="text-4xl mb-3">🏠</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No owners yet</h3>
            <p className="text-gray-500 mb-6">
              Add your first property owner to start managing payouts and property assignments.
            </p>
            <button onClick={openAdd} className="btn-accent">+ Add Owner</button>
          </div>
        ) : (
          /* Owners Table */
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50 text-left">
                  <th className="px-6 py-3 font-medium text-gray-500">Name</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Email</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Phone</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Address</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Properties</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Payout</th>
                  <th className="px-6 py-3 font-medium text-gray-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {owners.map(o => {
                  const pCount = ownerPropertyCount(o.id);
                  const ownerProps = ownerProperties(o.id);
                  return (
                    <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">{o.name}</td>
                      <td className="px-6 py-4 text-gray-500">{o.email}</td>
                      <td className="px-6 py-4 text-gray-500">{o.phone}</td>
                      <td className="px-6 py-4 text-gray-500 text-xs">
                        {o.address?.street ? `${o.address.street}, ${o.address.city}, ${o.address.state} ${o.address.zip}` : "—"}
                      </td>
                      <td className="px-6 py-4">
                        {pCount > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="badge bg-blue-100 text-blue-800">{pCount}</span>
                            <span className="text-xs text-gray-400" title={ownerProps.map(p => p.name).join(", ")}>
                              {ownerProps.map(p => p.name).join(", ")}
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">None</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        <div className="flex items-center gap-2">
                          <span className={`badge text-[10px] ${o.payoutMethod === "check" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
                            {o.payoutMethod === "check" ? "Check" : "ACH"}
                          </span>
                          {o.payoutMethod !== "check" && (
                            <span className="text-xs font-mono">
                              {o.achInfo?.bankName || "—"} • {maskAccount(o.achInfo?.accountNumber || "")}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleCharge(o.id)}
                            className="text-xs px-3 py-1.5 rounded-md border border-green-200 hover:bg-green-50 text-green-700"
                          >
                            💳 Charge
                          </button>
                          <button
                            onClick={() => openEdit(o)}
                            className="text-xs px-3 py-1.5 rounded-md border border-gray-200 hover:bg-gray-100 text-gray-600"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(o.id)}
                            className="text-xs px-3 py-1.5 rounded-md border border-red-200 hover:bg-red-50 text-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Add / Edit Modal */}
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/30" onClick={closeModal} />
            <div className="relative z-10 bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-lg mx-4 max-h-[90dvh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-lg font-semibold">{editOwner ? "Edit Owner" : "Add Owner"}</h2>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
              </div>

              {success ? (
                <div className="p-6 text-center">
                  <div className="text-4xl mb-3">✅</div>
                  <p className="text-gray-900 font-medium">{editOwner ? "Owner updated!" : "Owner added!"}</p>
                </div>
              ) : (
                <form onSubmit={handleSave} className="p-6 space-y-5">
                  {/* Contact Info */}
                  <fieldset>
                    <legend className="text-sm font-semibold text-gray-700 mb-3">Contact Information</legend>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Full Name *</label>
                        <input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Email *</label>
                          <input className="input-field" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                          <input className="input-field" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                        </div>
                      </div>
                    </div>
                  </fieldset>

                  {/* Mailing Address */}
                  <fieldset>
                    <legend className="text-sm font-semibold text-gray-700 mb-3">Mailing Address</legend>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Street</label>
                        <input className="input-field" value={form.address.street} onChange={e => setForm({ ...form, address: { ...form.address, street: e.target.value } })} />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                          <input className="input-field" value={form.address.city} onChange={e => setForm({ ...form, address: { ...form.address, city: e.target.value } })} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">State</label>
                          <input className="input-field" maxLength={2} value={form.address.state} onChange={e => setForm({ ...form, address: { ...form.address, state: e.target.value.toUpperCase() } })} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">ZIP</label>
                          <input className="input-field" maxLength={10} value={form.address.zip} onChange={e => setForm({ ...form, address: { ...form.address, zip: e.target.value } })} />
                        </div>
                      </div>
                    </div>
                  </fieldset>

                  {/* ACH Payment Info */}
                  <fieldset>
                    <legend className="text-sm font-semibold text-gray-700 mb-3">Payout Information</legend>
                    <p className="text-[10px] text-amber-600 bg-amber-50 rounded-lg px-2 py-1 mb-3">
                      ⚠️ These details are PM-provided and used to generate your ACH export file and check stubs.
                      RentMore never transmits payments or touches owner funds — you move the money from your own bank.
                      Handle the ACH export securely.
                    </p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Payout Method *</label>
                        <select
                          className="input-field"
                          value={form.payoutMethod}
                          onChange={e => setForm({ ...form, payoutMethod: e.target.value as "ACH" | "check" })}
                        >
                          <option value="ACH">ACH (direct deposit)</option>
                          <option value="check">Paper check</option>
                        </select>
                      </div>
                      {form.payoutMethod !== "check" && (
                        <>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Bank Name</label>
                            <input className="input-field" value={form.achInfo.bankName} onChange={e => setForm({ ...form, achInfo: { ...form.achInfo, bankName: e.target.value } })} />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Routing Number</label>
                              <input className="input-field" maxLength={9} value={form.achInfo.routingNumber} onChange={e => setForm({ ...form, achInfo: { ...form.achInfo, routingNumber: e.target.value } })} />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Account Number</label>
                              <input className="input-field" value={form.achInfo.accountNumber} onChange={e => setForm({ ...form, achInfo: { ...form.achInfo, accountNumber: e.target.value } })} />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </fieldset>

                  <div className="flex gap-3 pt-2">
                    <button type="submit" className="btn-accent flex-1">
                      {editOwner ? "Save Changes" : "Add Owner"}
                    </button>
                    <button type="button" onClick={closeModal} className="btn-secondary flex-1">Cancel</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {confirmDelete && (() => {
          const owner = owners.find(o => o.id === confirmDelete);
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="fixed inset-0 bg-black/30" onClick={() => setConfirmDelete(null)} />
              <div className="relative z-10 bg-white rounded-xl shadow-xl border border-gray-100 w-full max-w-sm mx-4 p-6 text-center">
                <div className="text-4xl mb-3">⚠️</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete {owner?.name}?</h3>
                <p className="text-sm text-gray-500 mb-2">
                  This will unlink {owner?.name} from {ownerPropertyCount(confirmDelete)} property(s).
                </p>
                <p className="text-xs text-gray-400 mb-5">
                  Owners with recorded payouts cannot be deleted (kept for your books).
                  This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button onClick={confirmDeleteOwner} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">Delete</button>
                  <button onClick={() => setConfirmDelete(null)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Charge Owner Modal */}
        {chargeOwnerId && (() => {
          const owner = owners.find(o => o.id === chargeOwnerId);
          if (!owner) return null;
          const charges = getOwnerChargesFor(chargeOwnerId);
          const openMaint = getOpenMaintForOwner(chargeOwnerId);
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="fixed inset-0 bg-black/30" onClick={() => setChargeOwnerId(null)} />
              <div className="relative z-10 bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-lg mx-4 max-h-[90dvh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Charge Owner via ACH</h2>
                  <button onClick={() => setChargeOwnerId(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
                </div>

                {chargeSuccess ? (
                  <div className="p-6 text-center">
                    <div className="text-4xl mb-3">✅</div>
                    <p className="text-gray-900 font-medium">Charge successful!</p>
                    <p className="text-sm text-gray-500 mt-1">{formatCurrency(parseFloat(chargeAmount))} will be debited from {owner.name}'s account.</p>
                  </div>
                ) : (
                  <div className="p-6 space-y-5">
                    {/* Owner info */}
                    <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                      <p><span className="text-gray-400">Owner:</span> <strong>{owner.name}</strong></p>
                      <p><span className="text-gray-400">Bank:</span> {owner.achInfo.bankName}</p>
                      <p><span className="text-gray-400">Account:</span> {maskAccount(owner.achInfo.accountNumber)}</p>
                    </div>

                    {/* Amount */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Amount ($) *</label>
                      <input
                        className="input-field"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={chargeAmount}
                        onChange={e => setChargeAmount(e.target.value)}
                        placeholder="0.00"
                        autoFocus
                      />
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Description *</label>
                      <input
                        className="input-field"
                        value={chargeDesc}
                        onChange={e => setChargeDesc(e.target.value)}
                        placeholder="e.g. Emergency plumbing repair - Sunset Villa"
                      />
                    </div>

                    {/* Maintenance Request link (optional) */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Maintenance Request (optional)</label>
                      <select className="input-field" value={chargeMaintId} onChange={e => setChargeMaintId(e.target.value)}>
                        <option value="">— None —</option>
                        {openMaint.map(m => (
                          <option key={m.id} value={m.id}>{m.id}: {m.description.slice(0, 50)}{m.description.length > 50 ? "…" : ""}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={submitCharge}
                        disabled={!chargeAmount || !chargeDesc.trim()}
                        className="btn-accent flex-1 disabled:opacity-50"
                      >
                        💳 Charge via ACH
                      </button>
                      <button type="button" onClick={() => setChargeOwnerId(null)} className="btn-secondary flex-1">Cancel</button>
                    </div>
                  </div>
                )}

                {/* Charges History */}
                {charges.length > 0 && (
                  <div className="border-t border-gray-100 px-6 py-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent Charges for {owner.name}</h3>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100 text-left text-gray-400">
                          <th className="pb-2 font-medium">Date</th>
                          <th className="pb-2 font-medium">Description</th>
                          <th className="pb-2 font-medium text-right">Amount</th>
                          <th className="pb-2 font-medium text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {charges.slice(0, 10).map(c => (
                          <tr key={c.id} className="border-b border-gray-50">
                            <td className="py-2 text-gray-500">{formatDate(c.date)}</td>
                            <td className="py-2">
                              <span className="text-gray-700">{c.description}</span>
                              {c.maintenanceRequestId && (
                                <span className="text-gray-400 ml-1">({getMaintDesc(c.maintenanceRequestId)})</span>
                              )}
                            </td>
                            <td className="py-2 text-right font-medium">{formatCurrency(c.amount / 100)}</td>
                            <td className="py-2 text-right">
                              <span className={`badge text-[10px] ${c.status === "success" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>
                                {c.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </DashboardLayout>
  );
}
