import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout } from "~/lib/layout";
import { formatDate } from "~/lib/data";
import { useStore } from "~/lib/store";
import { updateVendor, deleteVendor, addVendorRecord, updateVendorPayout, type Vendor } from "~/lib/shared-store";

const ALL_SERVICES = ["plumbing", "hvac", "cleaning", "housekeeping", "electrical", "appliance", "general", "landscaping", "pest control", "roofing"];

function maskACH(acct: string) {
  if (!acct) return "—";
  const last4 = acct.slice(-4);
  return `••••${last4}`;
}

export const Route = createFileRoute("/vendors")({
  component: VendorsPage,
});

function VendorsPage() {
  const store = useStore();
  const companyId = store.companyId;
  const vendors = store.vendors;
  const vendorPayouts = store.vendorPayouts;
  const maintenanceRequests = store.maintenanceRequests;
  const owners = store.owners;

  // Save/error state
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formServices, setFormServices] = useState<string[]>([]);
  const [formBankName, setFormBankName] = useState("");
  const [formRouting, setFormRouting] = useState("");
  const [formAccount, setFormAccount] = useState("");
  const [formNotes, setFormNotes] = useState("");
  // Mailing address
  const [formMailStreet, setFormMailStreet] = useState("");
  const [formMailCity, setFormMailCity] = useState("");
  const [formMailState, setFormMailState] = useState("");
  const [formMailZip, setFormMailZip] = useState("");

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Payout completion
  const [completingPayout, setCompletingPayout] = useState<string | null>(null);

  const openAdd = () => {
    setEditingVendor(null);
    setFormName(""); setFormCompany(""); setFormEmail(""); setFormPhone("");
    setFormServices([]); setFormBankName(""); setFormRouting(""); setFormAccount("");
    setFormNotes("");
    setFormMailStreet(""); setFormMailCity(""); setFormMailState(""); setFormMailZip("");
    setShowModal(true);
  };

  const openEdit = (v: Vendor) => {
    setEditingVendor(v);
    setFormName(v.name); setFormCompany(v.company); setFormEmail(v.email); setFormPhone(v.phone);
    setFormServices([...v.serviceTypes]); setFormBankName(v.achInfo.bankName);
    setFormRouting(v.achInfo.routingNumber); setFormAccount(v.achInfo.accountNumber);
    setFormNotes(v.notes);
    setFormMailStreet(v.mailingAddress?.street ?? "");
    setFormMailCity(v.mailingAddress?.city ?? "");
    setFormMailState(v.mailingAddress?.state ?? "");
    setFormMailZip(v.mailingAddress?.zip ?? "");
    setShowModal(true);
  };

  const toggleService = (s: string) => {
    setFormServices(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formCompany.trim()) return;

    const data = {
      name: formName.trim(),
      company: formCompany.trim(),
      email: formEmail.trim(),
      phone: formPhone.trim(),
      serviceTypes: formServices,
      achInfo: { bankName: formBankName.trim(), routingNumber: formRouting.trim(), accountNumber: formAccount.trim() },
      mailingAddress: (formMailStreet || formMailCity) ? { street: formMailStreet.trim(), city: formMailCity.trim(), state: formMailState.trim(), zip: formMailZip.trim() } : undefined,
      notes: formNotes.trim(),
    };

    setSaving(true); setFormError("");
    try {
      const { insertVendor, updateVendorDB } = await import("~/lib/db-queries");
      if (editingVendor) {
        await updateVendorDB({
          data: {
            companyId, vendorId: editingVendor.id,
            updates: {
              name: data.name, company: data.company, email: data.email, phone: data.phone,
              service_types: JSON.stringify(data.serviceTypes),
              ach_bank_name: data.achInfo.bankName, ach_routing_number: data.achInfo.routingNumber, ach_account_number: data.achInfo.accountNumber,
              notes: data.notes,
              ...(data.mailingAddress ? { mail_street: data.mailingAddress.street, mail_city: data.mailingAddress.city, mail_state: data.mailingAddress.state, mail_zip: data.mailingAddress.zip } : {}),
            },
          },
        });
        updateVendor(editingVendor.id, data);
      } else {
        const res = await insertVendor({ data: { companyId, ...data } });
        addVendorRecord({ ...data, id: res.id });
      }
      setShowModal(false);
    } catch (err: any) {
      setFormError(err?.message || "Couldn't save vendor — please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true); setFormError("");
    try {
      const { deleteVendorDB } = await import("~/lib/db-queries");
      await deleteVendorDB({ data: { companyId, vendorId: deleteTarget } });
      deleteVendor(deleteTarget);
      setDeleteTarget(null);
    } catch (err: any) {
      setFormError(err?.message || "Couldn't delete vendor — please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCompletePayout = (payoutId: string) => {
    updateVendorPayout(payoutId, { status: "paid", datePaid: new Date().toISOString().slice(0, 10) });
    setCompletingPayout(null);
  };

  const getVendorName = (vendorId: string) => vendors.find(v => v.id === vendorId)?.name ?? vendorId;
  const getRequestDesc = (reqId: string) => maintenanceRequests.find(m => m.id === reqId)?.description ?? reqId;

  return (
    <DashboardLayout currentPath="/vendors">
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
            <p className="mt-1 text-sm text-gray-500">Manage service providers and their payouts</p>
          </div>
          <button className="btn-primary gap-2" onClick={openAdd}>
            <span>+</span> Add Vendor
          </button>
        </div>
        {formError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{formError}</div>}

        {/* Vendor Table */}
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">Name</th>
                  <th className="text-left px-6 py-3 font-medium">Company</th>
                  <th className="text-left px-6 py-3 font-medium">Contact</th>
                  <th className="text-left px-6 py-3 font-medium">Services</th>
                  <th className="text-left px-6 py-3 font-medium">Bank</th>
                  <th className="text-left px-6 py-3 font-medium w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {vendors.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium">{v.name}</td>
                    <td className="px-6 py-3 text-gray-600">{v.company}</td>
                    <td className="px-6 py-3">
                      <div className="text-gray-600">{v.email}</div>
                      <div className="text-gray-400 text-xs">{v.phone}</div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex flex-wrap gap-1">
                        {v.serviceTypes.map(s => (
                          <span key={s} className="badge bg-blue-100 text-blue-800 text-[10px]">{s}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="text-gray-600 text-xs">{v.achInfo.bankName}</div>
                      <div className="text-gray-400 text-[10px]">Acct: {maskACH(v.achInfo.accountNumber)}</div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(v)} className="text-[#0f3c52] hover:underline text-xs">Edit</button>
                        <button onClick={() => setDeleteTarget(v.id)} className="text-red-600 hover:underline text-xs">Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {vendors.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No vendors added yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Vendor Payouts */}
        {vendorPayouts.length > 0 && (
          <div className="card">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Vendor Payouts</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left px-6 py-3 font-medium">Vendor</th>
                    <th className="text-left px-6 py-3 font-medium">Request</th>
                    <th className="text-left px-6 py-3 font-medium">Amount</th>
                    <th className="text-left px-6 py-3 font-medium">Method</th>
                    <th className="text-left px-6 py-3 font-medium">Period</th>
                    <th className="text-left px-6 py-3 font-medium">Status</th>
                    <th className="text-left px-6 py-3 font-medium">Date Paid</th>
                    <th className="text-left px-6 py-3 font-medium w-20">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {vendorPayouts.map((vp) => (
                    <tr key={vp.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium">{getVendorName(vp.vendorId)}</td>
                      <td className="px-6 py-3 text-gray-600 max-w-xs truncate">{getRequestDesc(vp.maintenanceRequestId)}</td>
                      <td className="px-6 py-3">${(vp.amount / 100).toFixed(2)}</td>
                      <td className="px-6 py-3">
                        {vp.paymentMethod === "check" ? (
                          <span className="text-xs" title="Check">✉️ Check</span>
                        ) : (
                          <span className="text-xs" title="ACH">🏦 ACH</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-gray-500">{vp.period}</td>
                      <td className="px-6 py-3">
                        <span className={`badge ${vp.status === "paid" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>
                          {vp.status}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-500">{vp.datePaid ? formatDate(vp.datePaid) : "—"}</td>
                      <td className="px-6 py-3">
                        {vp.status === "pending" && (
                          <button
                            onClick={() => setCompletingPayout(vp.id)}
                            className="text-green-700 hover:underline text-xs font-medium"
                          >
                            Mark Paid
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editingVendor ? "Edit Vendor" : "Add Vendor"}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input className="input-field" value={formName} onChange={e => setFormName(e.target.value)} placeholder="John Smith" required autoFocus />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company *</label>
                  <input className="input-field" value={formCompany} onChange={e => setFormCompany(e.target.value)} placeholder="ACME Plumbing" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input className="input-field" type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="john@acme.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input className="input-field" value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="(555) 123-4567" />
                </div>
              </div>

              {/* Services */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Services</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_SERVICES.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleService(s)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        formServices.includes(s)
                          ? "bg-[#0f3c52] text-white border-[#0f3c52]"
                          : "bg-white text-gray-600 border-gray-300 hover:border-[#0f3c52]"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* ACH Info */}
              <fieldset className="border border-gray-200 rounded-lg p-4">
                <legend className="text-sm font-medium text-gray-700 px-1">ACH / Bank Info</legend>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Bank Name</label>
                    <input className="input-field" value={formBankName} onChange={e => setFormBankName(e.target.value)} placeholder="Chase" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Routing Number</label>
                      <input className="input-field" value={formRouting} onChange={e => setFormRouting(e.target.value)} placeholder="021000021" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Account Number</label>
                      <input className="input-field" value={formAccount} onChange={e => setFormAccount(e.target.value)} placeholder="XXXX1234" />
                    </div>
                  </div>
                </div>
              </fieldset>

              {/* Mailing Address */}
              <fieldset className="border border-gray-200 rounded-lg p-4">
                <legend className="text-sm font-medium text-gray-700 px-1">✉️ Mailing Address (for check payments)</legend>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Street</label>
                    <input className="input-field" value={formMailStreet} onChange={e => setFormMailStreet(e.target.value)} placeholder="123 Main St" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">City</label>
                      <input className="input-field" value={formMailCity} onChange={e => setFormMailCity(e.target.value)} placeholder="Los Angeles" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">State</label>
                      <input className="input-field" value={formMailState} onChange={e => setFormMailState(e.target.value)} placeholder="CA" maxLength={2} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">ZIP</label>
                      <input className="input-field" value={formMailZip} onChange={e => setFormMailZip(e.target.value)} placeholder="90001" maxLength={10} />
                    </div>
                  </div>
                </div>
              </fieldset>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea className="input-field" rows={2} value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Any notes about this vendor..." />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-accent flex-1">
                  {editingVendor ? "Save Changes" : "Add Vendor"}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Delete Vendor?</h3>
            <p className="text-sm text-gray-500 mb-6">This cannot be undone. Any maintenance requests assigned to this vendor will lose their vendor association.</p>
            <div className="flex gap-3">
              <button onClick={handleDelete} className="btn-accent flex-1" style={{ backgroundColor: "#ef4444" }}>Delete</button>
              <button onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Payout Paid */}
      {completingPayout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setCompletingPayout(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Mark Payout as Paid?</h3>
            <p className="text-sm text-gray-500 mb-6">This confirms the vendor has been paid.</p>
            <div className="flex gap-3">
              <button onClick={() => handleCompletePayout(completingPayout)} className="btn-accent flex-1">Confirm Paid</button>
              <button onClick={() => setCompletingPayout(null)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
