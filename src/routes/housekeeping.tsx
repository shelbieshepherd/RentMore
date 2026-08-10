import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout } from "~/lib/layout";
import { properties, formatCurrency, formatDate } from "~/lib/data";
import { useStore } from "~/lib/store";

export const Route = createFileRoute("/housekeeping")({
  component: HousekeepingPage,
});

type CleanStatus = "pending" | "assigned" | "in-progress" | "verified" | "done";
type Priority = "high" | "medium" | "low";

interface CleanTask { id: string; propertyId: string; description: string; status: CleanStatus; priority: Priority; assignedTo: string; dueDate: string; window: string; verifiedBy?: string; }

const cleaners = ["Maria Santos", "Carlos Rivera", "Ana Lopez", "Juan Martinez"];

const seed: CleanTask[] = [
  { id:"c1",propertyId:"p1",description:"Full turnover — 3BR/2BA",status:"in-progress",priority:"high",assignedTo:"Maria Santos",dueDate:"2024-07-17",window:"10AM-2PM"},
  { id:"c2",propertyId:"p6",description:"Checkout clean — 4BR/3BA",status:"pending",priority:"high",assignedTo:"",dueDate:"2024-07-12",window:"11AM-3PM"},
  { id:"c3",propertyId:"p1",description:"Pre-arrival deep clean",status:"assigned",priority:"high",assignedTo:"Carlos Rivera",dueDate:"2024-08-01",window:"9AM-1PM"},
  { id:"c4",propertyId:"p3",description:"Deep clean & restock",status:"done",priority:"medium",assignedTo:"Ana Lopez",dueDate:"2024-06-30",window:"10AM-2PM",verifiedBy:"Manager"},
  { id:"c5",propertyId:"p6",description:"Pre-arrival clean",status:"pending",priority:"medium",assignedTo:"",dueDate:"2024-07-20",window:"12PM-4PM"},
  { id:"c6",propertyId:"p2",description:"Move-out deep clean",status:"assigned",priority:"high",assignedTo:"Juan Martinez",dueDate:"2024-08-15",window:"9AM-1PM"},
];

export default function HousekeepingPage() {
  const { bookings } = useStore();
  const [tasks, setTasks] = useState<CleanTask[]>(seed);
  const [filter, setFilter] = useState("all");

  const filtered = filter === "all" ? tasks : tasks.filter(t => t.status === filter);

  const updateStatus = (id: string, status: CleanStatus) => {
    setTasks(ts => ts.map(t => t.id === id ? {...t, status, ...(status==="verified"?{verifiedBy:"Manager"}:{})} : t));
  };

  const assignCleaner = (id: string, cleaner: string) => {
    setTasks(ts => ts.map(t => t.id === id ? {...t, assignedTo: cleaner, status: "assigned"} : t));
  };

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
          <button className="btn-primary gap-2">+ New Task</button>
        </div>
        <div className="flex gap-2">{[{k:"all",l:"All"},{k:"pending",l:"Pending"},{k:"assigned",l:"Assigned"},{k:"in-progress",l:"In Progress"},{k:"verified",l:"Verified"},{k:"done",l:"Done"}].map(f => <button key={f.k} onClick={()=>setFilter(f.k)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filter===f.k?"text-white":"bg-gray-100 text-gray-600"}`} style={filter===f.k?{backgroundColor:"#0f3c52"}:{}}>{f.l} ({f.k==="all"?tasks.length:tasks.filter(t=>t.status===f.k).length})</button>)}</div>
        <div className="space-y-3">
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
                      {t.status==="high" && <span className="badge bg-red-100 text-red-800">HIGH</span>}
                    </div>
                    <p className="text-sm text-gray-500">{prop?.name} · {formatDate(t.dueDate)} · {t.window}</p>
                    {booking && <p className="text-xs text-orange-500 mt-0.5">🔄 Auto-generated from {booking.guestName}'s checkout</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {t.status==="pending" && <select className="input-field text-xs w-36" onChange={e => assignCleaner(t.id, e.target.value)} value=""><option value="">Assign...</option>{cleaners.map(c=><option key={c} value={c}>{c}</option>)}</select>}
                    {t.status==="assigned" && <button onClick={()=>updateStatus(t.id,"in-progress")} className="bg-blue-500 text-white text-xs px-3 py-1 rounded-lg">Start</button>}
                    {t.status==="in-progress" && <><button onClick={()=>updateStatus(t.id,"done")} className="bg-green-500 text-white text-xs px-3 py-1 rounded-lg">Mark Done</button></>}
                    {t.status==="done" && <button onClick={()=>updateStatus(t.id,"verified")} className="bg-purple-500 text-white text-xs px-3 py-1 rounded-lg">Verify ✓</button>}
                    {t.status==="verified" && <span className="text-xs text-green-600 font-medium">✅ Complete</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}