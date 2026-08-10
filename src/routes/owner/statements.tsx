import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "~/lib/auth";
import { OwnerLayout } from "~/lib/owner-layout";
import { useStore } from "~/lib/store";
import { formatCurrency, feeConfig } from "~/lib/data";

const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export const Route = createFileRoute("/owner/statements")({ component: OwnerStatements });

export default function OwnerStatements() {
  const { user } = useAuth();
  const store = useStore();
  const ownerId = user?.ownerId;
  const myProperties = store.properties.filter(p => p.ownerId === ownerId);
  const myPropertyIds = myProperties.map(p => p.id);

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  // Filter bookings that overlap with selected month/year
  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = new Date(year, month + 1, 0).toISOString().slice(0, 10);

  const monthBookings = store.bookings.filter(b => {
    if (!myPropertyIds.includes(b.propertyId)) return false;
    return b.startDate <= monthEnd && b.endDate >= monthStart;
  });

  const grossIncome = monthBookings.reduce((s, b) => {
    // Prorate: only count nights within the month
    const bStart = new Date(Math.max(new Date(b.startDate).getTime(), new Date(monthStart).getTime()));
    const bEnd = new Date(Math.min(new Date(b.endDate).getTime(), new Date(monthEnd).getTime()));
    const nightsInMonth = Math.max(0, Math.ceil((bEnd.getTime() - bStart.getTime()) / 86400000));
    return s + nightsInMonth * b.nightlyRate;
  }, 0);

  const commission = monthBookings.reduce((s, b) => {
    const bStart = new Date(Math.max(new Date(b.startDate).getTime(), new Date(monthStart).getTime()));
    const bEnd = new Date(Math.min(new Date(b.endDate).getTime(), new Date(monthEnd).getTime()));
    const nightsInMonth = Math.max(0, Math.ceil((bEnd.getTime() - bStart.getTime()) / 86400000));
    const bSubtotal = nightsInMonth * b.nightlyRate;
    const cleaning = 250;
    const linen = 150;
    return s + Math.round((bSubtotal + cleaning + linen) * feeConfig.commissionRate * 100) / 100;
  }, 0);

  // Maintenance for owner's properties in this month
  const monthMaintenance = store.maintenanceRequests
    .filter(m => myPropertyIds.includes(m.propertyId) && m.dateReported >= monthStart && m.dateReported <= monthEnd)
    .reduce((s) => s + 0, 0); // No cost field on MaintenanceRequest, placeholder

  const netPayout = grossIncome - commission - monthMaintenance;

  return (
    <OwnerLayout currentPath="/owner/statements">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Monthly Statements</h1>

        <div className="flex gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Month</label>
            <select className="input-field" value={month} onChange={e => setMonth(Number(e.target.value))}>
              {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
            <select className="input-field" value={year} onChange={e => setYear(Number(e.target.value))}>
              {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        <div className="card p-6 max-w-md">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            Statement — {months[month]} {year}
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-gray-100 pb-2">
              <span className="text-gray-500">Gross Rental Income</span>
              <span className="font-medium">{formatCurrency(grossIncome)}</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-2">
              <span className="text-gray-500">Management Commission ({Math.round(feeConfig.commissionRate * 100)}%)</span>
              <span className="text-red-600">−{formatCurrency(commission)}</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-2">
              <span className="text-gray-500">Maintenance & Expenses</span>
              <span className="text-red-600">−{formatCurrency(monthMaintenance)}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 pt-1">
              <span>Net Payout</span>
              <span style={{ color: "#0f3c52" }}>{formatCurrency(netPayout)}</span>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100">
            <p className="text-[10px] text-gray-400">
              This statement is generated from real booking and payout data. All amounts are in USD.
            </p>
          </div>
        </div>
      </div>
    </OwnerLayout>
  );
}
