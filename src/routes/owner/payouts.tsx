import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "~/lib/auth";
import { OwnerLayout } from "~/lib/owner-layout";
import { useStore } from "~/lib/store";
import { formatCurrency, formatDate } from "~/lib/data";

export const Route = createFileRoute("/owner/payouts")({ component: OwnerPayouts });

export default function OwnerPayouts() {
  const { user } = useAuth();
  const store = useStore();
  const ownerId = user?.ownerId;
  const myPayouts = store.ownerPayouts.filter(p => p.ownerId === ownerId);

  const currentYear = new Date().getFullYear().toString();
  const paidYTD = myPayouts
    .filter(p => p.status === "paid" && p.period?.includes(currentYear))
    .reduce((s, p) => s + p.amount, 0);
  const pendingTotal = myPayouts
    .filter(p => p.status === "pending")
    .reduce((s, p) => s + p.amount, 0);

  return (
    <OwnerLayout currentPath="/owner/payouts">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">My Payouts</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="card p-4">
            <p className="text-xs text-gray-500 uppercase">Paid Year-To-Date ({currentYear})</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(paidYTD)}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500 uppercase">Pending Payouts</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{formatCurrency(pendingTotal)}</p>
          </div>
        </div>

        <div className="card p-4">
          {myPayouts.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No payouts yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-gray-400 border-b">
                  <tr>
                    <th className="text-left py-2 font-medium">Period</th>
                    <th className="text-left py-2 font-medium">Amount</th>
                    <th className="text-left py-2 font-medium">Status</th>
                    <th className="text-left py-2 font-medium">Date Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {myPayouts.map(op => (
                    <tr key={op.id} className="border-b border-gray-50">
                      <td className="py-2">{op.period}</td>
                      <td className="py-2 font-medium">{formatCurrency(op.amount)}</td>
                      <td className="py-2">
                        <span className={`badge text-xs ${op.status === "paid" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                          {op.status}
                        </span>
                      </td>
                      <td className="py-2 text-gray-500">{op.datePaid ? formatDate(op.datePaid) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </OwnerLayout>
  );
}
