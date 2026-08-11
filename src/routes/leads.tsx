import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardLayout } from "~/lib/layout";
import { formatCurrency, formatDate } from "~/lib/data";
import { useStore } from "~/lib/store";
import { DEFAULT_COMPANY_ID } from "~/lib/db-queries";

export const Route = createFileRoute("/leads")({
  component: LeadsPage,
});

type Stage = "new" | "contacted" | "tour" | "negotiation" | "won" | "lost";
interface Lead { id: string; name: string; email: string; phone: string; source: string; stage: Stage; propertyId?: string; value: number; notes: string; date: string; }

// Demo-company fallback only (when the DB is unreachable or empty for the demo tenant).
// Real companies always get empty-if-empty from the DB.
const seedLeads: Lead[] = [
  { id:"l1",name:"Amanda Blake",email:"amanda@email.com",phone:"555-1001",source:"Website",stage:"new",value:3500,notes:"Interested in beachfront property",date:"2024-07-10"},
  { id:"l2",name:"Thomas Reed",email:"thomas@email.com",phone:"555-1002",source:"Referral",stage:"contacted",value:2200,notes:"Referred by Sarah Johnson",date:"2024-07-05"},
  { id:"l3",name:"Olivia Chen",email:"olivia@email.com",phone:"555-1003",source:"Booking.com",stage:"tour",propertyId:"p3",value:3200,notes:"Scheduled tour July 20",date:"2024-07-02"},
  { id:"l4",name:"Marcus Webb",email:"marcus@email.com",phone:"555-1004",source:"Direct",stage:"negotiation",propertyId:"p5",value:2800,notes:"Negotiating lease terms",date:"2024-06-28"},
  { id:"l5",name:"Priya Patel",email:"priya@email.com",phone:"555-1005",source:"Airbnb",stage:"won",propertyId:"p1",value:4500,notes:"Converted — booking Aug 1",date:"2024-06-15"},
  { id:"l6",name:"Jake Morrison",email:"jake@email.com",phone:"555-1006",source:"Website",stage:"lost",value:1800,notes:"Chose competitor property",date:"2024-06-10"},
];

const stages: { key: Stage; label: string; color: string }[] = [
  { key:"new",label:"New",color:"bg-gray-100"},{ key:"contacted",label:"Contacted",color:"bg-blue-50"},
  { key:"tour",label:"Tour",color:"bg-yellow-50"},{ key:"negotiation",label:"Negotiation",color:"bg-orange-50"},
  { key:"won",label:"Won ✅",color:"bg-green-50"},{ key:"lost",label:"Lost ❌",color:"bg-red-50"},
];

function mapDbLead(b: any): Lead {
  return {
    id: b.id, name: b.name, email: b.email || "", phone: b.phone || "",
    source: b.source || "", stage: (b.stage as Stage) || "new",
    propertyId: b.property_id || undefined,
    value: Number(b.value || 0),
    notes: b.notes || "",
    date: String(b.date || "").slice(0, 10),
  };
}

const emptyForm = () => ({
  name: "", email: "", phone: "", source: "", stage: "new" as Stage,
  value: "", propertyId: "", notes: "", date: new Date().toISOString().slice(0, 10),
});
type FormState = ReturnType<typeof emptyForm>;

export default function LeadsPage() {
  const { companyId, properties } = useStore();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [pageError, setPageError] = useState("");
  // Create/edit modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPageError("");
    (async () => {
      try {
        const { fetchLeads } = await import("~/lib/db-queries");
        const rows = await fetchLeads({ data: { companyId } });
        if (cancelled) return;
        if (rows && rows.length > 0) setLeads(rows.map(mapDbLead));
        else if (companyId === DEFAULT_COMPANY_ID) setLeads(seedLeads); // demo fallback
        else setLeads([]); // real company: empty-if-empty
      } catch {
        if (!cancelled) setLeads(companyId === DEFAULT_COMPANY_ID ? seedLeads : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const openNew = () => { setEditingId(null); setForm(emptyForm()); setFormError(""); setFormOpen(true); };
  const openEdit = (lead: Lead) => {
    setEditingId(lead.id);
    setForm({
      name: lead.name, email: lead.email, phone: lead.phone, source: lead.source,
      stage: lead.stage, value: lead.value ? String(lead.value) : "",
      propertyId: lead.propertyId || "", notes: lead.notes, date: lead.date || new Date().toISOString().slice(0, 10),
    });
    setFormError(""); setFormOpen(true);
  };

  const moveLead = async (id: string, stage: Stage) => {
    const prev = leads;
    setLeads(ls => ls.map(l => l.id === id ? { ...l, stage } : l));
    setSelectedLead(l => l && l.id === id ? { ...l, stage } : l);
    setPageError("");
    try {
      const { updateLeadDB } = await import("~/lib/db-queries");
      await updateLeadDB({ data: { companyId, leadId: id, updates: { stage } } });
    } catch {
      setLeads(prev);
      setSelectedLead(l => l && l.id === id ? prev.find(p => p.id === id) || null : l);
      setPageError("Couldn't update lead stage — check your connection and try again.");
    }
  };

  const saveLead = async () => {
    if (!form.name.trim()) { setFormError("Name is required."); return; }
    setSaving(true); setFormError("");
    const payload = {
      name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(),
      source: form.source.trim(), stage: form.stage,
      value: form.value ? Number(form.value) : 0,
      propertyId: form.propertyId || undefined,
      notes: form.notes.trim(), date: form.date || new Date().toISOString().slice(0, 10),
    };
    try {
      const { insertLead, updateLeadDB } = await import("~/lib/db-queries");
      if (editingId) {
        await updateLeadDB({ data: { companyId, leadId: editingId, updates: payload } });
        setLeads(ls => ls.map(l => l.id === editingId ? { ...l, ...payload } : l));
        setSelectedLead(l => l && l.id === editingId ? { ...l, ...payload } : l);
      } else {
        const res = await insertLead({ data: { companyId, ...payload } });
        const newLead: Lead = { id: res.id, ...payload as Omit<typeof payload, never> };
        setLeads(ls => [...ls, newLead].sort((a, b) => (b.date || "") < (a.date || "") ? -1 : 1));
      }
      setFormOpen(false);
    } catch (e: any) {
      setFormError(e?.message || "Couldn't save lead — please try again.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true); setDeleteError("");
    try {
      const { deleteLead } = await import("~/lib/db-queries");
      await deleteLead({ data: { companyId, leadId: deleteTarget.id } });
      setLeads(ls => ls.filter(l => l.id !== deleteTarget.id));
      setSelectedLead(l => l && l.id === deleteTarget.id ? null : l);
      setDeleteTarget(null);
    } catch (e: any) {
      setDeleteError(e?.message || "Couldn't delete lead — please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const propName = (id?: string) => id ? properties.find(p => p.id === id)?.name || id : "";

  const wonLeads = leads.filter(l => l.stage === "won");
  const wonValue = wonLeads.reduce((s, l) => s + l.value, 0);

  return (
    <DashboardLayout currentPath="/leads">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div><h1 className="text-2xl font-bold text-gray-900">Lead Pipeline</h1><p className="text-sm text-gray-500">{leads.length} leads · {wonLeads.length} won · {formatCurrency(wonValue)} pipeline value</p></div>
          <button className="btn-primary gap-2" onClick={openNew}>+ New Lead</button>
        </div>
        {pageError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{pageError}</div>}
        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Loading leads…</div>
        ) : (
        <div className="grid grid-cols-6 gap-3 overflow-x-auto">
          {stages.map(stage => {
            const stageLeads = leads.filter(l=>l.stage===stage.key);
            return (
              <div key={stage.key} className={`${stage.color} rounded-xl p-3 min-h-[300px]`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">{stage.label}</h3>
                  <span className="text-xs text-gray-400">{stageLeads.length}</span>
                </div>
                <div className="space-y-2">{
                  stageLeads.map(lead => (
                    <div key={lead.id} className="bg-white rounded-lg shadow-sm p-3 cursor-pointer hover:shadow-md transition-shadow" onClick={()=>setSelectedLead(lead)}>
                      <p className="text-sm font-medium">{lead.name}</p>
                      <p className="text-xs text-gray-500">{lead.source || "—"} · {lead.date ? formatDate(lead.date) : "—"}</p>
                      <p className="text-xs font-medium mt-1" style={{color:"#0f3c52"}}>{formatCurrency(lead.value)}</p>
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {stages.slice(stages.findIndex(s=>s.key===stage.key)+1).filter(s=>s.key!=="lost").map(s => (
                          <button key={s.key} onClick={e=>{e.stopPropagation();moveLead(lead.id,s.key);}} className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded hover:bg-gray-200">→{s.label}</button>
                        ))}
                        {stage.key!=="lost"&&stage.key!=="won"&&<button onClick={e=>{e.stopPropagation();moveLead(lead.id,"lost");}} className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded hover:bg-red-200">Lost</button>}
                      </div>
                    </div>
                  ))
                }</div>
              </div>
            );
          })}
        </div>
        )}
        {selectedLead && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={()=>setSelectedLead(null)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md px-6 py-6" onClick={e=>e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold">{selectedLead.name}</h2><button onClick={()=>setSelectedLead(null)} className="text-gray-400 text-xl">&times;</button></div>
              <div className="space-y-2 text-sm"><div className="flex justify-between"><span className="text-gray-500">Email</span><span>{selectedLead.email || "—"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Phone</span><span>{selectedLead.phone || "—"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Source</span><span>{selectedLead.source || "—"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Value</span><span className="font-semibold">{formatCurrency(selectedLead.value)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Date</span><span>{selectedLead.date ? formatDate(selectedLead.date) : "—"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Stage</span><span>{stages.find(s=>s.key===selectedLead.stage)?.label}</span></div>
              {selectedLead.propertyId && <div className="flex justify-between"><span className="text-gray-500">Property</span><span>{propName(selectedLead.propertyId)}</span></div>}
              </div>
              <p className="text-sm text-gray-400 mt-3 bg-gray-50 rounded-lg p-3">{selectedLead.notes || "No notes"}</p>
              <div className="flex gap-2 mt-4">
                <button className="btn-secondary flex-1" onClick={()=>{openEdit(selectedLead);}}>Edit</button>
                <button className="flex-1 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100" onClick={()=>setDeleteTarget(selectedLead)}>Delete</button>
              </div>
            </div>
          </div>
        )}
        {formOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={()=>!saving && setFormOpen(false)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg px-6 py-6 max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold">{editingId ? "Edit Lead" : "New Lead"}</h2><button onClick={()=>!saving && setFormOpen(false)} className="text-gray-400 text-xl">&times;</button></div>
              <div className="space-y-3">
                <div><label className="text-xs font-medium text-gray-600">Name *</label><input className="input-field w-full mt-1" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Lead name" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-medium text-gray-600">Email</label><input className="input-field w-full mt-1" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="name@email.com" /></div>
                  <div><label className="text-xs font-medium text-gray-600">Phone</label><input className="input-field w-full mt-1" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="555-0000" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-medium text-gray-600">Source</label><input className="input-field w-full mt-1" value={form.source} onChange={e=>setForm({...form,source:e.target.value})} placeholder="Website, Referral, Airbnb…" /></div>
                  <div><label className="text-xs font-medium text-gray-600">Stage</label><select className="input-field w-full mt-1" value={form.stage} onChange={e=>setForm({...form,stage:e.target.value as Stage})}>{stages.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-medium text-gray-600">Value ($)</label><input type="number" min="0" className="input-field w-full mt-1" value={form.value} onChange={e=>setForm({...form,value:e.target.value})} placeholder="0" /></div>
                  <div><label className="text-xs font-medium text-gray-600">Date</label><input type="date" className="input-field w-full mt-1" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} /></div>
                </div>
                <div><label className="text-xs font-medium text-gray-600">Property</label><select className="input-field w-full mt-1" value={form.propertyId} onChange={e=>setForm({...form,propertyId:e.target.value})}><option value="">— None —</option>{properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                <div><label className="text-xs font-medium text-gray-600">Notes</label><textarea className="input-field w-full mt-1" rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Notes about this lead…" /></div>
                {formError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{formError}</div>}
                <div className="flex gap-2 pt-1">
                  <button className="btn-primary flex-1" disabled={saving} onClick={saveLead}>{saving ? "Saving…" : editingId ? "Save changes" : "Add lead"}</button>
                  <button className="btn-secondary" disabled={saving} onClick={()=>setFormOpen(false)}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={()=>!deleting && setDeleteTarget(null)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm px-6 py-6" onClick={e=>e.stopPropagation()}>
              <h2 className="text-lg font-semibold mb-2">Delete lead?</h2>
              <p className="text-sm text-gray-500 mb-4">“{deleteTarget.name}” will be permanently removed from the pipeline.</p>
              {deleteError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 mb-3">{deleteError}</div>}
              <div className="flex gap-2">
                <button className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50" disabled={deleting} onClick={confirmDelete}>{deleting ? "Deleting…" : "Delete"}</button>
                <button className="btn-secondary flex-1" disabled={deleting} onClick={()=>setDeleteTarget(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
