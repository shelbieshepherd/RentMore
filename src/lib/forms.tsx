// RentVue - CRUD form modals
import { useState, type ReactNode } from "react";
import { properties as seedProperties } from "./data";
import { useStore } from "./store";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-xl">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

type FieldProps = {
  label: string;
  children: ReactNode;
  colSpan?: boolean;
};

function Field({ label, children, colSpan }: FieldProps) {
  return (
    <div className={colSpan ? "col-span-2" : ""}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

// --- Property Form ---
export function AddPropertyModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { addProperty } = useStore();
  const [form, setForm] = useState({ name: "", address: "", type: "long-term" as const, monthlyRent: 0, deposit: 0, status: "vacant" as const, ownerId: "o1", image: "" });
  const [success, setSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addProperty({ ...form, monthlyRent: Number(form.monthlyRent), deposit: Number(form.deposit) });
    setSuccess(true);
    setTimeout(() => { setSuccess(false); setForm({ name: "", address: "", type: "long-term", monthlyRent: 0, deposit: 0, status: "vacant", ownerId: "o1", image: "" }); onClose(); }, 1200);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={success ? "Property Added! ✅" : "Add Property"}>
      {success ? (
        <div className="p-12 text-center"><p className="text-lg font-medium text-green-600">Property added successfully!</p></div>
      ) : (
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Property Name" colSpan><input className="input-field" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Beach Condo" required /></Field>
            <Field label="Address" colSpan><input className="input-field" value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="Full address" required /></Field>
            <Field label="Type">
              <select className="input-field" value={form.type} onChange={e => setForm({...form, type: e.target.value as any})}>
                <option value="long-term">Long-term</option>
                <option value="short-term">Short-term</option>
              </select>
            </Field>
            <Field label="Status">
              <select className="input-field" value={form.status} onChange={e => setForm({...form, status: e.target.value as any})}>
                <option value="vacant">Vacant</option>
                <option value="occupied">Occupied</option>
              </select>
            </Field>
            <Field label="Monthly Rent ($)"><input className="input-field" type="number" value={form.monthlyRent} onChange={e => setForm({...form, monthlyRent: Number(e.target.value)})} min={0} required /></Field>
            <Field label="Deposit ($)"><input className="input-field" type="number" value={form.deposit} onChange={e => setForm({...form, deposit: Number(e.target.value)})} min={0} required /></Field>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Add Property</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// --- Occupant Form (merged Tenant + Guest) ---
export function AddOccupantModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { addTenant, addPayment, addBooking } = useStore();
  const defaultProp = seedProperties[0]?.id || "p1";
  const [form, setForm] = useState({
    name: "", email: "", phone: "", address: "", propertyId: defaultProp,
    leaseStart: "", leaseEnd: "", rentAmount: 0, deposit: 0,
    bookingStart: "", bookingEnd: "", nightlyRate: 0,
  });
  const [success, setSuccess] = useState(false);

  const selectedProperty = seedProperties.find(p => p.id === form.propertyId);
  const isShortTerm = selectedProperty?.type === "short-term";

  const calcTotal = () => {
    if (!form.bookingStart || !form.bookingEnd || !form.nightlyRate) return 0;
    const nights = Math.ceil((new Date(form.bookingEnd).getTime() - new Date(form.bookingStart).getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, nights) * Number(form.nightlyRate);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isShortTerm) {
      addBooking({
        propertyId: form.propertyId,
        guestName: form.name,
        guestEmail: form.email,
        guestPhone: form.phone || undefined,
        guestAddress: form.address || undefined,
        startDate: form.bookingStart,
        endDate: form.bookingEnd,
        nightlyRate: Number(form.nightlyRate),
        status: "confirmed",
        totalAmount: calcTotal(),
        source: "direct",
        commissionRate: 0.15,
        createdAt: new Date().toISOString(),
        createdBy: "Admin",
      });
    } else {
      addTenant({
        name: form.name, email: form.email, phone: form.phone, address: form.address || undefined,
        propertyId: form.propertyId, type: "tenant" as const,
        leaseStart: form.leaseStart, leaseEnd: form.leaseEnd,
        rentAmount: Number(form.rentAmount), deposit: Number(form.deposit),
        checkoutStatus: undefined, bookingStart: undefined, bookingEnd: undefined, nightlyRate: undefined,
      });
      addPayment({
        propertyId: form.propertyId, tenantId: `t${Date.now()}`, amount: Number(form.rentAmount),
        date: "", dueDate: new Date().toISOString().slice(0, 10), status: "pending", method: "ACH",
        description: `${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })} Rent`,
      });
    }
    setSuccess(true);
    setTimeout(() => { setSuccess(false); onClose(); }, 1200);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={success ? "Occupant Added! ✅" : "Add Occupant"}>
      {success ? (
        <div className="p-12 text-center"><p className="text-lg font-medium text-green-600">{isShortTerm ? "Guest booking created!" : "Tenant added successfully!"}</p></div>
      ) : (
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Property" colSpan>
              <select className="input-field" value={form.propertyId} onChange={e => setForm({...form, propertyId: e.target.value})}>
                {seedProperties.map(p => <option key={p.id} value={p.id}>{p.name} ({p.type === "short-term" ? "Short-term" : "Long-term"})</option>)}
              </select>
            </Field>
            <Field label={isShortTerm ? "Guest Name" : "Full Name"} colSpan><input className="input-field" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Name" required /></Field>
            <Field label="Email" colSpan><input className="input-field" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="email@example.com" required /></Field>
            <Field label="Phone" colSpan><input className="input-field" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="(555) 000-0000" /></Field>
            <Field label="Address" colSpan><input className="input-field" value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="Street, City, State ZIP" /></Field>
            {isShortTerm ? (
              <>
                <Field label="Check-in"><input className="input-field" type="date" value={form.bookingStart} onChange={e => setForm({...form, bookingStart: e.target.value})} required /></Field>
                <Field label="Check-out"><input className="input-field" type="date" value={form.bookingEnd} onChange={e => setForm({...form, bookingEnd: e.target.value})} required /></Field>
                <Field label="Nightly Rate ($)"><input className="input-field" type="number" value={form.nightlyRate} onChange={e => setForm({...form, nightlyRate: Number(e.target.value)})} min={0} required /></Field>
                <Field label="Est. Total">
                  <div className="h-[38px] flex items-center text-sm font-semibold" style={{ color: "#0f3c52" }}>
                    {calcTotal() > 0 ? `$${calcTotal().toLocaleString()}` : "—"}
                  </div>
                </Field>
              </>
            ) : (
              <>
                <Field label="Lease Start"><input className="input-field" type="date" value={form.leaseStart} onChange={e => setForm({...form, leaseStart: e.target.value})} required /></Field>
                <Field label="Lease End"><input className="input-field" type="date" value={form.leaseEnd} onChange={e => setForm({...form, leaseEnd: e.target.value})} required /></Field>
                <Field label="Monthly Rent ($)"><input className="input-field" type="number" value={form.rentAmount} onChange={e => setForm({...form, rentAmount: Number(e.target.value)})} min={0} required /></Field>
                <Field label="Deposit ($)"><input className="input-field" type="number" value={form.deposit} onChange={e => setForm({...form, deposit: Number(e.target.value)})} min={0} required /></Field>
              </>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Add Occupant</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// --- Maintenance Form ---
export function AddMaintenanceModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { addMaintenanceRequest } = useStore();
  const [form, setForm] = useState({ propertyId: seedProperties[0]?.id || "p1", description: "", priority: "medium" as const, assignedTo: "" });
  const [success, setSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addMaintenanceRequest({
      ...form, status: "open" as const,
      dateReported: new Date().toISOString().slice(0, 10),
    });
    setSuccess(true);
    setTimeout(() => { setSuccess(false); onClose(); }, 1200);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={success ? "Request Created! ✅" : "New Maintenance Request"}>
      {success ? (
        <div className="p-12 text-center"><p className="text-lg font-medium text-green-600">Maintenance request created!</p></div>
      ) : (
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-4">
            <Field label="Property" colSpan>
              <select className="input-field" value={form.propertyId} onChange={e => setForm({...form, propertyId: e.target.value})}>
                {seedProperties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Description" colSpan>
              <textarea className="input-field min-h-[80px]" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Describe the issue..." required />
            </Field>
            <Field label="Priority">
              <select className="input-field" value={form.priority} onChange={e => setForm({...form, priority: e.target.value as any})}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </Field>
            <Field label="Assigned To">
              <input className="input-field" value={form.assignedTo} onChange={e => setForm({...form, assignedTo: e.target.value})} placeholder="Vendor name" required />
            </Field>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Create Request</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// --- Quick Add Dropdown ---
export type QuickAddType = "property" | "occupant" | "maintenance";
