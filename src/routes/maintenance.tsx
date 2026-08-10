import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout } from "~/lib/layout";
import { maintenanceRequests, properties, formatDate, formatCurrency, getStatusColor, type MaintenanceRequest } from "~/lib/data";
import { useStore } from "~/lib/store";
import { addMaintenanceRequest } from "~/lib/shared-store";

export const Route = createFileRoute("/maintenance")({
  component: MaintenancePage,
});

function maskACH(acct: string) {
  if (!acct) return "—";
  const last4 = acct.slice(-4);
  return `••••${last4}`;
}

function formatTimestamp(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function MaintenancePage() {
  const store = useStore();
  const requests = store.maintenanceRequests.length > 0 ? store.maintenanceRequests : maintenanceRequests;
  const openRequests = requests.filter(m => m.status === "open" || m.status === "in-progress");
  const resolvedRequests = requests.filter(m => m.status === "resolved");
  const vendors = store.vendors;
  const owners = store.owners;

  // New request modal
  const [showNew, setShowNew] = useState(false);
  const [newDesc, setNewDesc] = useState("");
  const [newPropId, setNewPropId] = useState(properties[0]?.id || "");
  const [newPriority, setNewPriority] = useState<MaintenanceRequest["priority"]>("medium");
  const [newAssignedTo, setNewAssignedTo] = useState("");

  // Detail modal
  const [detailRequest, setDetailRequest] = useState<MaintenanceRequest | null>(null);
  const [noteText, setNoteText] = useState("");

  // Vendor assignment
  const [assignVendorId, setAssignVendorId] = useState("");

  // Confirmation modals
  const [chargeOwnerConfirm, setChargeOwnerConfirm] = useState(false);
  const [releaseVendorConfirm, setReleaseVendorConfirm] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<"ACH" | "check">("ACH");

  const selectedRequest = detailRequest
    ? store.maintenanceRequests.find(m => m.id === detailRequest.id) ?? detailRequest
    : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDesc.trim()) return;
    addMaintenanceRequest({
      propertyId: newPropId,
      description: newDesc.trim(),
      priority: newPriority,
      status: "open",
      assignedTo: newAssignedTo || "Unassigned",
      dateReported: new Date().toISOString().slice(0, 10),
      cost: 0,
      chargedToOwner: false,
    });
    setShowNew(false);
    setNewDesc("");
    setNewAssignedTo("");
  };

  const openDetail = (req: MaintenanceRequest) => {
    setDetailRequest(req);
    setAssignVendorId(req.vendorId || "");
    setNoteText("");
    setChargeOwnerConfirm(false);
    setReleaseVendorConfirm(false);
  };

  const handleAddNote = () => {
    if (!noteText.trim() || !selectedRequest) return;
    store.addMaintenanceNote(selectedRequest.id, noteText.trim());
    setNoteText("");
    // Refresh detail
    const updated = store.maintenanceRequests.find(m => m.id === selectedRequest.id);
    if (updated) setDetailRequest(updated);
  };

  const handleAssignVendor = () => {
    if (!selectedRequest || !assignVendorId) return;
    const vendor = vendors.find(v => v.id === assignVendorId);
    store.updateMaintenanceRequest(selectedRequest.id, {
      vendorId: assignVendorId,
      assignedTo: vendor ? vendor.name : selectedRequest.assignedTo,
    });
    const updated = store.maintenanceRequests.find(m => m.id === selectedRequest.id);
    if (updated) setDetailRequest(updated);
  };

  const handleChargeOwner = () => {
    if (!selectedRequest) return;
    store.updateMaintenanceRequest(selectedRequest.id, { chargedToOwner: true });
    setChargeOwnerConfirm(false);
    const updated = store.maintenanceRequests.find(m => m.id === selectedRequest.id);
    if (updated) setDetailRequest(updated);
  };

  const handleReleaseToVendor = () => {
    if (!selectedRequest || !selectedRequest.vendorId) return;
    const vendor = vendors.find(v => v.id === selectedRequest.vendorId);
    if (!vendor) return;

    store.addVendorPayout({
      vendorId: vendor.id,
      maintenanceRequestId: selectedRequest.id,
      amount: selectedRequest.cost,
      status: "pending",
      paymentMethod: payoutMethod,
      period: new Date().toISOString().slice(0, 7),
    });
    setReleaseVendorConfirm(false);
    setPayoutMethod("ACH");
    const updated = store.maintenanceRequests.find(m => m.id === selectedRequest.id);
    if (updated) setDetailRequest(updated);
  };

  const getPropertyName = (propId: string) => properties.find(p => p.id === propId)?.name ?? propId;
  const getVendorName = (vendorId?: string) => {
    if (!vendorId) return null;
    return vendors.find(v => v.id === vendorId) ?? null;
  };
  const getOwnerForProperty = (propId: string) => {
    const prop = properties.find(p => p.id === propId);
    if (!prop) return null;
    return owners.find(o => o.id === prop.ownerId) ?? null;
  };

  return (
    <DashboardLayout currentPath="/maintenance">
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Maintenance</h1>
            <p className="mt-1 text-sm text-gray-500">Track and manage maintenance requests</p>
          </div>
          <button className="btn-primary gap-2" onClick={() => { setShowNew(true); setNewDesc(""); setNewPriority("medium"); setNewAssignedTo(""); }}>
            <span>+</span> New Request
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
          <div className="stat-card">
            <p className="text-sm text-gray-500">Total</p>
            <p className="text-3xl font-bold mt-1">{requests.length}</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-gray-500">Open</p>
            <p className="text-3xl font-bold mt-1 text-red-600">{requests.filter(m => m.status === "open").length}</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-gray-500">In Progress</p>
            <p className="text-3xl font-bold mt-1 text-blue-600">{requests.filter(m => m.status === "in-progress").length}</p>
          </div>
          <div className="stat-card">
            <p className="text-sm text-gray-500">Resolved</p>
            <p className="text-3xl font-bold mt-1 text-green-600">{resolvedRequests.length}</p>
          </div>
        </div>

        {/* Open Requests */}
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold">Open Requests</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">Description</th>
                  <th className="text-left px-6 py-3 font-medium">Property</th>
                  <th className="text-left px-6 py-3 font-medium">Priority</th>
                  <th className="text-left px-6 py-3 font-medium">Status</th>
                  <th className="text-left px-6 py-3 font-medium">Assigned To</th>
                  <th className="text-left px-6 py-3 font-medium">Cost</th>
                  <th className="text-left px-6 py-3 font-medium">Reported</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {openRequests.map((req) => {
                  const property = properties.find(p => p.id === req.propertyId);
                  const vendor = getVendorName(req.vendorId);
                  return (
                    <tr key={req.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openDetail(req)}>
                      <td className="px-6 py-3 font-medium max-w-xs truncate">{req.description}</td>
                      <td className="px-6 py-3">
                        <span className="text-[#0f3c52]">{property?.name ?? "—"}</span>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`badge ${getStatusColor(req.priority)}`}>{req.priority}</span>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`badge ${getStatusColor(req.status)}`}>{req.status}</span>
                      </td>
                      <td className="px-6 py-3 text-gray-500">
                        {vendor ? <span className="text-[#0f3c52] font-medium">{vendor.name}</span> : req.assignedTo}
                      </td>
                      <td className="px-6 py-3 text-gray-500">{req.cost > 0 ? formatCurrency(req.cost / 100) : "—"}</td>
                      <td className="px-6 py-3 text-gray-500">{formatDate(req.dateReported)}</td>
                    </tr>
                  );
                })}
                {openRequests.length === 0 && (
                  <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">No open maintenance requests</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Resolved Requests */}
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold">Resolved Requests</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">Description</th>
                  <th className="text-left px-6 py-3 font-medium">Property</th>
                  <th className="text-left px-6 py-3 font-medium">Priority</th>
                  <th className="text-left px-6 py-3 font-medium">Assigned To</th>
                  <th className="text-left px-6 py-3 font-medium">Reported</th>
                  <th className="text-left px-6 py-3 font-medium">Resolved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {resolvedRequests.map((req) => {
                  const property = properties.find(p => p.id === req.propertyId);
                  return (
                    <tr key={req.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openDetail(req)}>
                      <td className="px-6 py-3 font-medium max-w-xs truncate">{req.description}</td>
                      <td className="px-6 py-3">
                        <span className="text-[#0f3c52]">{property?.name ?? "—"}</span>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`badge ${getStatusColor(req.priority)}`}>{req.priority}</span>
                      </td>
                      <td className="px-6 py-3 text-gray-500">
                        {getVendorName(req.vendorId)?.name ?? req.assignedTo}
                      </td>
                      <td className="px-6 py-3 text-gray-500">{formatDate(req.dateReported)}</td>
                      <td className="px-6 py-3 text-gray-500">{formatDate(req.dateResolved || "")}</td>
                    </tr>
                  );
                })}
                {resolvedRequests.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No resolved requests</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* New Request Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowNew(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold">New Maintenance Request</h2>
              <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea className="input-field" rows={3} value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Describe the issue..." required autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
                <select className="input-field" value={newPropId} onChange={e => setNewPropId(e.target.value)}>
                  {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select className="input-field" value={newPriority} onChange={e => setNewPriority(e.target.value as MaintenanceRequest["priority"])}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
                  <input className="input-field" value={newAssignedTo} onChange={e => setNewAssignedTo(e.target.value)} placeholder="e.g. Mike" />
                </div>
              </div>
              <button type="submit" className="btn-accent w-full">Create Request</button>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDetailRequest(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">Request {selectedRequest.id}</h2>
                <span className={`badge ${getStatusColor(selectedRequest.status)}`}>{selectedRequest.status}</span>
                <span className={`badge ${getStatusColor(selectedRequest.priority)}`}>{selectedRequest.priority}</span>
                {selectedRequest.chargedToOwner && (
                  <span className="badge bg-purple-100 text-purple-800">Charged to Owner</span>
                )}
              </div>
              <button onClick={() => setDetailRequest(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6">
              {/* Core details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-400 uppercase font-medium">Property</p>
                  <p className="text-sm font-medium mt-1">{getPropertyName(selectedRequest.propertyId)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase font-medium">Reported</p>
                  <p className="text-sm font-medium mt-1">{formatDate(selectedRequest.dateReported)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase font-medium">Assigned To</p>
                  <p className="text-sm font-medium mt-1">
                    {getVendorName(selectedRequest.vendorId)?.name ?? selectedRequest.assignedTo}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase font-medium">Cost</p>
                  <p className="text-sm font-medium mt-1">{selectedRequest.cost > 0 ? formatCurrency(selectedRequest.cost / 100) : "—"}</p>
                </div>
              </div>

              {/* Description */}
              <div>
                <p className="text-xs text-gray-400 uppercase font-medium">Description</p>
                <p className="text-sm mt-1 text-gray-800 whitespace-pre-wrap">{selectedRequest.description}</p>
              </div>

              {/* Assign Vendor */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-sm font-semibold mb-3">Vendor</p>
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Assign Vendor</label>
                    <select
                      className="input-field"
                      value={assignVendorId}
                      onChange={e => setAssignVendorId(e.target.value)}
                    >
                      <option value="">— None —</option>
                      {vendors.map(v => (
                        <option key={v.id} value={v.id}>{v.name} — {v.company} ({v.serviceTypes.join(", ")})</option>
                      ))}
                    </select>
                  </div>
                  <button
                    className="btn-secondary text-sm"
                    onClick={handleAssignVendor}
                    disabled={!assignVendorId || assignVendorId === selectedRequest.vendorId}
                  >
                    Assign
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-sm font-semibold mb-3">Notes</p>
                <div className="flex gap-2 mb-3">
                  <input
                    className="input-field flex-1"
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    placeholder="Add a note..."
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddNote(); } }}
                  />
                  <button className="btn-accent text-sm" onClick={handleAddNote} disabled={!noteText.trim()}>
                    Add
                  </button>
                </div>
                {selectedRequest.notes && selectedRequest.notes.length > 0 ? (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {[...selectedRequest.notes].reverse().map((note, i) => (
                      <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 text-sm">
                        <p className="text-gray-800">{note.text}</p>
                        <p className="text-gray-400 text-[10px] mt-1">{formatTimestamp(note.timestamp)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">No notes yet</p>
                )}
              </div>

              {/* Actions */}
              <div className="border-t border-gray-100 pt-4 flex flex-wrap gap-3">
                {/* Charge Owner */}
                {selectedRequest.cost > 0 && !selectedRequest.chargedToOwner && (
                  <button
                    className="btn-secondary text-sm"
                    onClick={() => setChargeOwnerConfirm(true)}
                  >
                    💰 Charge Owner
                  </button>
                )}

                {/* Release to Vendor */}
                {selectedRequest.vendorId && selectedRequest.chargedToOwner && selectedRequest.cost > 0 && (
                  <button
                    className="btn-accent text-sm"
                    onClick={() => setReleaseVendorConfirm(true)}
                  >
                    ✅ Release to Vendor
                  </button>
                )}

                {/* Mark Resolved */}
                {selectedRequest.status !== "resolved" && (
                  <button
                    className="btn-secondary text-sm"
                    onClick={() => {
                      store.updateMaintenanceRequest(selectedRequest.id, {
                        status: "resolved",
                        dateResolved: new Date().toISOString().slice(0, 10),
                      });
                      setDetailRequest(null);
                    }}
                  >
                    ✓ Mark Resolved
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Charge Owner Confirmation */}
      {chargeOwnerConfirm && selectedRequest && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setChargeOwnerConfirm(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Charge Owner?</h3>
            <p className="text-sm text-gray-500 mb-4">
              This will deduct <strong>{formatCurrency(selectedRequest.cost / 100)}</strong> from the owner's next payout.
            </p>
            {(() => {
              const owner = getOwnerForProperty(selectedRequest.propertyId);
              if (owner) {
                return (
                  <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm space-y-1">
                    <p><span className="text-gray-400">Owner:</span> <strong>{owner.name}</strong></p>
                    <p><span className="text-gray-400">Bank:</span> {owner.achInfo.bankName}</p>
                    <p><span className="text-gray-400">Account:</span> {maskACH(owner.achInfo.accountNumber)}</p>
                  </div>
                );
              }
              return null;
            })()}
            <div className="flex gap-3">
              <button onClick={handleChargeOwner} className="btn-accent flex-1">Confirm Charge</button>
              <button onClick={() => setChargeOwnerConfirm(false)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Release to Vendor Confirmation */}
      {releaseVendorConfirm && selectedRequest && (() => {
        const vendor = getVendorName(selectedRequest.vendorId);
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setReleaseVendorConfirm(false)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-2">Release Payment to Vendor?</h3>
              <p className="text-sm text-gray-500 mb-4">
                This will create a <strong>{formatCurrency(selectedRequest.cost / 100)}</strong> payout to the vendor.
              </p>

              {/* Payment Method Picker */}
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-500 mb-2">Payment Method</p>
                <div className="space-y-2">
                  <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${payoutMethod === "ACH" ? "border-[#0f3c52] bg-[#0f3c52]/5" : "border-gray-200 hover:border-gray-300"}`}>
                    <input type="radio" name="payoutMethod" value="ACH" checked={payoutMethod === "ACH"} onChange={() => setPayoutMethod("ACH")} className="accent-[#0f3c52]" />
                    <span className="text-sm font-medium">🏦 ACH Transfer</span>
                  </label>
                  <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${payoutMethod === "check" ? "border-[#0f3c52] bg-[#0f3c52]/5" : "border-gray-200 hover:border-gray-300"}`}>
                    <input type="radio" name="payoutMethod" value="check" checked={payoutMethod === "check"} onChange={() => setPayoutMethod("check")} className="accent-[#0f3c52]" />
                    <span className="text-sm font-medium">✉️ Mail Check</span>
                  </label>
                </div>
              </div>

              {vendor && payoutMethod === "ACH" && (
                <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm space-y-1">
                  <p><span className="text-gray-400">Vendor:</span> <strong>{vendor.name}</strong> ({vendor.company})</p>
                  <p><span className="text-gray-400">Bank:</span> {vendor.achInfo.bankName}</p>
                  <p><span className="text-gray-400">Account:</span> {maskACH(vendor.achInfo.accountNumber)}</p>
                </div>
              )}

              {vendor && payoutMethod === "check" && (
                <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm space-y-1">
                  <p><span className="text-gray-400">Vendor:</span> <strong>{vendor.name}</strong> ({vendor.company})</p>
                  {vendor.mailingAddress ? (
                    <>
                      <p><span className="text-gray-400">Mail to:</span> {vendor.mailingAddress.street}</p>
                      <p className="pl-14">{vendor.mailingAddress.city}, {vendor.mailingAddress.state} {vendor.mailingAddress.zip}</p>
                    </>
                  ) : (
                    <p className="text-yellow-700 text-xs">⚠️ No mailing address on file for this vendor. Please add one on the Vendors page.</p>
                  )}
                  <p className="text-gray-400 text-xs mt-1">Check will be mailed to vendor's address on file.</p>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={handleReleaseToVendor} className="btn-accent flex-1">Confirm Release</button>
                <button onClick={() => setReleaseVendorConfirm(false)} className="btn-secondary flex-1">Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}
    </DashboardLayout>
  );
}
