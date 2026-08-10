import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "~/lib/auth";
import { OwnerLayout } from "~/lib/owner-layout";
import { useStore } from "~/lib/store";
import { formatCurrency } from "~/lib/data";

export const Route = createFileRoute("/owner/taxes")({ component: OwnerTaxes });

export default function OwnerTaxes() {
  const { user } = useAuth();
  const store = useStore();
  const ownerId = user?.ownerId;
  const owner = store.owners.find(o => o.id === ownerId);
  const myProperties = store.properties.filter(p => p.ownerId === ownerId);
  const myPropIds = new Set(myProperties.map(p => p.id));

  const currentYear = new Date().getFullYear();
  const yearStart = `${currentYear}-01-01`;
  const yearEnd = `${currentYear}-12-31`;

  // Bookings for owner's properties, by startDate, non-cancelled
  const yearBookings = store.bookings.filter(b => {
    if (!myPropIds.has(b.propertyId)) return false;
    if (b.status === "cancelled") return false;
    return b.startDate >= yearStart && b.startDate <= yearEnd;
  });

  // Box 1: Gross rents = sum of booking totalAmount
  const grossRents = yearBookings.reduce((s, b) => s + b.totalAmount, 0);

  // Commissions = sum of (totalAmount * commissionRate)
  const commissions = yearBookings.reduce(
    (s, b) => s + Math.round(b.totalAmount * b.commissionRate * 100) / 100, 0
  );

  // Maintenance deductions
  const maintenance = store.maintenanceRequests
    .filter(m => m.chargedToOwner && myPropIds.has(m.propertyId))
    .reduce((s, m) => s + (m.cost || 0), 0);

  const netIncome = grossRents - commissions - maintenance;

  return (
    <OwnerLayout currentPath="/owner/taxes">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">1099 Tax Form — {currentYear}</h1>
        <p className="text-sm text-gray-500">
          This is a summary of your annual income for tax purposes. Consult a CPA for official filing.
        </p>

        <div className="card p-6 max-w-lg">
          <div className="border-2 border-gray-200 rounded-lg p-6">
            <h3 className="text-center font-bold text-gray-800 mb-1">Form 1099-MISC</h3>
            <p className="text-center text-xs text-gray-400 mb-4">Miscellaneous Income</p>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500">Recipient</span>
                <span className="font-medium text-right">{owner?.name || "—"}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500">TIN / EIN</span>
                <span className="font-medium">{owner?.tin || "—"}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500">Address</span>
                <span className="font-medium text-right text-xs">
                  {owner?.address
                    ? `${owner.address.street}, ${owner.address.city}, ${owner.address.state} ${owner.address.zip}`
                    : "—"}
                </span>
              </div>
              <div className="border-t border-gray-200 pt-3 mt-3">
                <div className="flex justify-between pb-2">
                  <span className="text-gray-700 font-medium">Box 1 — Gross Rents</span>
                  <span className="font-bold">{formatCurrency(grossRents)}</span>
                </div>
                <div className="flex justify-between pb-2">
                  <span className="text-gray-500">Management Commissions</span>
                  <span className="text-red-600">−{formatCurrency(commissions)}</span>
                </div>
                <div className="flex justify-between pb-2">
                  <span className="text-gray-500">Maintenance Deductions</span>
                  <span className="text-orange-500">−{formatCurrency(maintenance)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2 mt-1">
                  <span className="text-gray-800 font-semibold">Net Income</span>
                  <span className="font-bold" style={{ color: "#0f3c52" }}>{formatCurrency(netIncome)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </OwnerLayout>
  );
}
