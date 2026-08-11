import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardLayout } from "~/lib/layout";
import { formatDate } from "~/lib/data";
import { useStore } from "~/lib/store";
import { DEFAULT_COMPANY_ID } from "~/lib/db-queries";

export const Route = createFileRoute("/housekeeping")({
  component: HousekeepingPage,
});

type CleanStatus = "pending" | "assigned" | "in-progress" | "verified" | "done";
type Priority = "high" | "medium" | "low";

interface CleanTask { id: string; propertyId: string; description: string; status: CleanStatus; priority: Priority; assignedTo: string; dueDate: string; window: string; verifiedBy?: string; }

const cleaners = ["Maria Santos", "Carlos Rivera", "Ana Lopez", "Juan Martinez"];

// Demo-company fallback only (DB unreachable or empty for the demo tenant).
const seed: CleanTask[] = [
  { id:"c1",propertyId:"p1",description:"Full turnover — 3BR/2BA",status:"in-progress",priority:"high",assignedTo:"Maria Santos",dueDate:"2024-07-17",window:"10AM-2PM"},
  { id:"c2",propertyId:"p6",description:"Checkout clean — 4BR/3BA",status:"pending",priority:"high",assignedTo:"",dueDate:"2024-07-12",window:"11AM-3PM"},
  { id:"c3",propertyId:"p1",description:"Pre-arrival deep clean",status:"assigned",priority:"high",assignedTo:"Carlos Rivera",dueDate:"2024-08-01",window:"9AM-1PM"},
  { id:"c4",propertyId:"p3",description:"Deep clean & restock",status:"done",priority:"medium",assignedTo:"Ana Lopez",dueDate:"2024-06-30",window:"10AM-2PM",verifiedBy:"Manager"},
  { id:"c5",propertyId:"p6",description:"Pre-arrival clean",status:"pending",priority:"medium",assignedTo:"",dueDate:"2024-07-20",window:"12PM-4PM"},
  { id:"c6",propertyId:"p2",description:"Move-out deep clean",status:"assigned",priority:"high",assignedTo:"Juan Martinez",dueDate:"2024-08-15",window:"9AM-1PM"},
];

function mapDbTask(h: any): CleanTask {
  return {
    id: h.id, propertyId: h.propertyId, description: h.description, status: h.status as CleanStatus,
    priority: h.priority as Priority, assignedTo: h.assignedTo || "", dueDate: h.dueDate || "",
    window: h.window || "", verifiedBy: h.verifiedBy || undefined,
  };
}

export default function HousekeepingPage() {
  const { companyId, bookings, properties } = useStore();
  const [tasks, setTasks] = useState<CleanTask[]>(seed);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  // New-task modal
  const [formOpen, setFormOpen] = useState(false);
  const [formDesc, setFormDesc] = useState("");
  const [formProp, setFormProp] = useState(properties[0]?.id || "");
  const [formDue, setFormDue] = useState(new Date().toISOString().slice(0, 10));
  const [formWindow, setFormWindow] = useState("10AM-2PM");
  const [formPriority, setFormPriority] = useState<Priority>("medium");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setPageError("");
    (async () => {
      try {
        const { fetchHousekeeping } = await import("~/lib/db-queries");
        const rows = await fetchHousekeeping({ data: { companyId } });
        if (cancelled) return;
        if (rows && rows.length > 0) setTasks(rows.map(mapDbTask));
        else setTasks(companyId === DEFAULT_COMPANY_ID ? seed : []);
      } catch {
        if (!cancelled) setTasks(companyId === DEFAULT_COMPANY_ID ? seed : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const saveTask = async () => {
    if (!formDesc.trim() || !formProp) { setFormError("Description and property are required."); return; }
    setSaving(true); setFormError("");
    try {
      const { insertHousekeepingTask } = await import("~/lib/db-queries");
      const res = await insertHousekeepingTask({ data: { companyId, propertyId: formProp, description: formDesc.trim(), status: "pending", priority: formPriority, dueDate: formDue, window: formWindow } });
      const t: CleanTask = { id: res.id, propertyId: formProp, description: formDesc.trim(), status: "pending", priority: formPriority, assignedTo: "", dueDate: formDue, window: formWindow };
      setTasks(ts => [...ts, t]);
      setFormOpen(false);
    } catch (e: any) {
      setFormError(e?.message || "Couldn't create task — please try again.");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, status: CleanStatus) => {
    const prev = tasks;
    setTasks(ts => ts.map(t => t.id === id ? { ...t, status, ...(status === "verified" ? { verifiedBy: "Manager" } : {}) } : t));
    setPageError("");
    try {
      const { updateHousekeepingTask } = await import("~/lib/db-queries");
      await updateHousekeepingTask({ data: { companyId, taskId: id, updates: { status, ...(status === "verified" ? { verifiedBy: "Manager" } : {}) } } });
    } catch {
      setTasks(prev);
      setPageError("Couldn't update task — check your connection and try again.");
    }
  };

  const assignCleaner = async (id: string, cleaner: string) => {
    const prev = tasks;
    setTasks(ts => ts.map(t => t.id === id ? { ...t, assignedTo: cleaner, status: "assigned" } : t));
    setPageError("");
    try {
      const { updateHousekeepingTask } = await import("~/lib/db-queries");
      await updateHousekeepingTask({ data: { companyId, taskId: id, updates: { assignedTo: cleaner, status: "assigned" } } });
    } catch {
      setTasks(prev);
      setPageError("Couldn't assign cleaner — check your connection and try again.");
    }
  };

  const filtered = filter === "all" ? tasks : tasks.filter(t => t.status === filter);

  const statusColors: Record<CleanStatus, string> = {
    pending: "bg-gray-100 text-gray-600", assigned: "bg-blue-100 text-blue-800",
    "in-progress": "bg-yellow-100 text-yellow-800", verified: "bg-purple-100 text-purple-800",
    done: "bg-green-100 text-green-800",
  };

  return (
    <DashboardLayout currentPath="/housekeeping">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div><h1 className="text-2xl font-bold text-gray-900">Housekeeping</h1><p className="text-sm text-gray-500">Turnover cleaning task board</p></div>
          <button className="btn-primary gap-2" onClick={() => { setFormError(""); setFormDesc(""); setFormWindow("10AM-2PM"); setFormDue(new Date().toISOString().slice(0, 10)); setFormPriority("medium"); setFormOpen(true); }}>+ New Task</button>
        </div>
        {pageError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{pageError}</div>}
        <div className="flex gap-2">{[{k:"all",l:"All"},{k:"pending",l:"Pending"},{k:"assigned",l:"Assigned"},{k:"in-progress",l:"In Progress"},{k:"verified",l:"Verified"},{k:"done",l:"Done"}].map(f => <button key={f.k} onClick={()=>setFilter(f.k)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filter===f.k?"text-white":"bg-gray-100 text-gray-600"}`} style={filter===f.k?{backgroundColor:"#0f3c52"}:{}}>{f.l} ({f.k==="all"?tasks.length:tasks.filter(t=>t.status===f.k).length})</button>)}</div>
        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Loading tasks…</div>
        ) : (
        <div className="space-y-3">
          {filtered.map(t => {
            const prop = (properties.length ? properties : []).find(p=>p.id===t.propertyId);
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
        )}
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
                <div><label className="text-xs font-medium text-gray-600">Priority</label><select className="input-field w-full mt-1" value={formPriority} onChange={e=>setFormPriority(e.target.value as Priority)}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div>
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
