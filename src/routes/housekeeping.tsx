import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout } from "~/lib/layout";
import { formatDate } from "~/lib/data";
import { useStore } from "~/lib/store";
import { addStoreHousekeeping, patchStoreHousekeeping, type HousekeepingTask } from "~/lib/shared-store";

export const Route = createFileRoute("/housekeeping")({
  component: HousekeepingPage,
});

const cleaners = ["Maria Santos", "Carlos Rivera", "Ana Lopez", "Juan Martinez"];

export default function HousekeepingPage() {
  const { companyId, housekeepingTasks, properties, bookings } = useStore();
  const tasks = housekeepingTasks;
  const [filter, setFilter] = useState("all");
  const [pageError, setPageError] = useState("");
  // New-task modal
  const [formOpen, setFormOpen] = useState(false);
  const [formDesc, setFormDesc] = useState("");
  const [formProp, setFormProp] = useState(properties[0]?.id || "");
  const [formDue, setFormDue] = useState(new Date().toISOString().slice(0, 10));
  const [formWindow, setFormWindow] = useState("10AM-2PM");
  const [formPriority, setFormPriority] = useState<HousekeepingTask["priority"]>("medium");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const openNew = () => {
    setFormError(""); setFormDesc(""); setFormWindow("10AM-2PM");
    setFormDue(new Date().toISOString().slice(0, 10)); setFormPriority("medium");
    setFormProp(properties[0]?.id || "");
    setFormOpen(true);
  };

  const saveTask = async () => {
    if (!formDesc.trim() || !formProp) { setFormError("Description and property are required."); return; }
    setSaving(true); setFormError("");
    try {
      const { insertHousekeepingTask } = await import("~/lib/db-queries");
      const res = await insertHousekeepingTask({ data: { companyId, propertyId: formProp, description: formDesc.trim(), status: "pending", priority: formPriority, dueDate: formDue, window: formWindow } });
      addStoreHousekeeping({ id: res.id, propertyId: formProp, description: formDesc.trim(), status: "pending", priority: formPriority, assignedTo: "", dueDate: formDue, window: formWindow });
      setFormOpen(false);
    } catch (e: any) {
      setFormError(e?.message || "Couldn't create task — please try again.");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, status: HousekeepingTask["status"]) => {
    const prev = tasks.find(t => t.id === id);
    const extra = status === "verified" ? { verifiedBy: "Manager" } : {};
    patchStoreHousekeeping(id, { status, ...extra });
    setPageError("");
    try {
      const { updateHousekeepingTask } = await import("~/lib/db-queries");
      await updateHousekeepingTask({ data: { companyId, taskId: id, updates: { status, ...extra } } });
    } catch {
      if (prev) patchStoreHousekeeping(id, prev);
      setPageError("Couldn't update task — check your connection and try again.");
    }
  };

  const assignCleaner = async (id: string, cleaner: string) => {
    const prev = tasks.find(t => t.id === id);
    patchStoreHousekeeping(id, { assignedTo: cleaner, status: "assigned" });
    setPageError("");
    try {
      const { updateHousekeepingTask } = await import("~/lib/db-queries");
      await updateHousekeepingTask({ data: { companyId, taskId: id, updates: { assignedTo: cleaner, status: "assigned" } } });
    } catch {
      if (prev) patchStoreHousekeeping(id, prev);
      setPageError("Couldn't assign cleaner — check your connection and try again.");
    }
  };

  const filtered = filter === "all" ? tasks : tasks.filter(t => t.status === filter);

  const statusColors: Record<HousekeepingTask["status"], string> = {
    pending: "bg-gray-100 text-gray-600", assigned: "bg-blue-100 text-blue-800",
    "in-progress": "bg-yellow-100 text-yellow-800", verified: "bg-purple-100 text-purple-800",
    done: "bg-green-100 text-green-800",
  };

  return (
    <DashboardLayout currentPath="/housekeeping">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div><h1 className="text-2xl font-bold text-gray-900">Housekeeping</h1><p className="text-sm text-gray-500">Turnover cleaning task board</p></div>
          <button className="btn-primary gap-2" onClick={openNew}>+ New Task</button>
        </div>
        {pageError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{pageError}</div>}
        <div className="flex gap-2">{[{k:"all",l:"All"},{k:"pending",l:"Pending"},{k:"assigned",l:"Assigned"},{k:"in-progress",l:"In Progress"},{k:"verified",l:"Verified"},{k:"done",l:"Done"}].map(f => <button key={f.k} onClick={()=>setFilter(f.k)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filter===f.k?"text-white":"bg-gray-100 text-gray-600"}`} style={filter===f.k?{backgroundColor:"#0f3c52"}:{}}>{f.l} ({f.k==="all"?tasks.length:tasks.filter(t=>t.status===f.k).length})</button>)}</div>
        <div className="space-y-3">
          {filtered.length === 0 && <div className="text-center py-16 text-gray-400 text-sm">No cleaning tasks{filter !== "all" ? ` with status "${filter}"` : ""} — create one above.</div>}
          {filtered.map(t => {
            const prop = properties.find(p=>p.id===t.propertyId);
            const booking = bookings.find(b=>b.propertyId===t.propertyId && b.endDate <= t.dueDate && b.status !== "cancelled");
            return (
              <div key={t.id} className="card p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{t.description}</h3>
                      <span className={`badge ${statusColors[t.status]}`}>{t.status}</span>
                      {t.priority==="high" && <span className="badge bg-red-100 text-red-800">HIGH</span>}
                    </div>
                    <p className="text-sm text-gray-500">{prop?.name || t.propertyId} · {formatDate(t.dueDate)} · {t.window}</p>
                    {booking && <p className="text-xs text-orange-500 mt-0.5">🔄 Auto-generated from {booking.guestName}'s checkout</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {t.status==="pending" && <select className="input-field text-xs w-36" onChange={e => assignCleaner(t.id, e.target.value)} value=""><option value="">Assign...</option>{cleaners.map(c=><option key={c} value={c}>{c}</option>)}</select>}
                    {t.status==="assigned" && <button onClick={()=>updateStatus(t.id,"in-progress")} className="bg-blue-500 text-white text-xs px-3 py-1 rounded-lg">Start</button>}
                    {t.status==="in-progress" && <button onClick={()=>updateStatus(t.id,"done")} className="bg-green-500 text-white text-xs px-3 py-1 rounded-lg">Mark Done</button>}
                    {t.status==="done" && <button onClick={()=>updateStatus(t.id,"verified")} className="bg-purple-500 text-white text-xs px-3 py-1 rounded-lg">Verify ✓</button>}
                    {t.status==="verified" && <span className="text-xs text-green-600 font-medium">✅ Complete</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {formOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={()=>!saving && setFormOpen(false)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md px-6 py-6" onClick={e=>e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold">New Cleaning Task</h2><button onClick={()=>!saving && setFormOpen(false)} className="text-gray-400 text-xl">&times;</button></div>
              <div className="space-y-3">
                <div><label className="text-xs font-medium text-gray-600">Description *</label><input className="input-field w-full mt-1" value={formDesc} onChange={e=>setFormDesc(e.target.value)} placeholder="Full turnover — 3BR/2BA" /></div>
                <div><label className="text-xs font-medium text-gray-600">Property *</label><select className="input-field w-full mt-1" value={formProp} onChange={e=>setFormProp(e.target.value)}>{properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-medium text-gray-600">Due date</label><input type="date" className="input-field w-full mt-1" value={formDue} onChange={e=>setFormDue(e.target.value)} /></div>
                  <div><label className="text-xs font-medium text-gray-600">Window</label><input className="input-field w-full mt-1" value={formWindow} onChange={e=>setFormWindow(e.target.value)} placeholder="10AM-2PM" /></div>
                </div>
                <div><label className="text-xs font-medium text-gray-600">Priority</label><select className="input-field w-full mt-1" value={formPriority} onChange={e=>setFormPriority(e.target.value as HousekeepingTask["priority"])}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div>
                {formError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{formError}</div>}
                <div className="flex gap-2 pt-1">
                  <button className="btn-primary flex-1" disabled={saving} onClick={saveTask}>{saving ? "Saving…" : "Create task"}</button>
                  <button className="btn-secondary" disabled={saving} onClick={()=>setFormOpen(false)}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
