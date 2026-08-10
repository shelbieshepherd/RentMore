import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout } from "~/lib/layout";
import { properties, formatCurrency, formatDate } from "~/lib/data";

export const Route = createFileRoute("/leads")({
  component: LeadsPage,
});

type Stage = "new" | "contacted" | "tour" | "negotiation" | "won" | "lost";
interface Lead { id: string; name: string; email: string; phone: string; source: string; stage: Stage; propertyId?: string; value: number; notes: string; date: string; }

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

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>(seedLeads);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const moveLead = (id: string, stage: Stage) => {
    setLeads(ls => ls.map(l => l.id === id ? {...l, stage} : l));
  };

  return (
    <DashboardLayout currentPath="/leads">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div><h1 className="text-2xl font-bold text-gray-900">Lead Pipeline</h1><p className="text-sm text-gray-500">{leads.length} leads · {leads.filter(l=>l.stage==="won").length} won · {formatCurrency(leads.filter(l=>l.stage==="won").reduce((s,l)=>s+l.value,0))} pipeline value</p></div>
          <button className="btn-primary gap-2">+ New Lead</button>
        </div>
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
                      <p className="text-xs text-gray-500">{lead.source} · {formatDate(lead.date)}</p>
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
        {selectedLead && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={()=>setSelectedLead(null)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md px-6 py-6" onClick={e=>e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold">{selectedLead.name}</h2><button onClick={()=>setSelectedLead(null)} className="text-gray-400 text-xl">&times;</button></div>
              <div className="space-y-2 text-sm"><div className="flex justify-between"><span className="text-gray-500">Email</span><span>{selectedLead.email}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Phone</span><span>{selectedLead.phone}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Source</span><span>{selectedLead.source}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Value</span><span className="font-semibold">{formatCurrency(selectedLead.value)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Date</span><span>{formatDate(selectedLead.date)}</span></div>
              {selectedLead.propertyId && <div className="flex justify-between"><span className="text-gray-500">Property</span><span>{properties.find(p=>p.id===selectedLead.propertyId)?.name}</span></div>}
              </div>
              <p className="text-sm text-gray-400 mt-3 bg-gray-50 rounded-lg p-3">{selectedLead.notes}</p>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}