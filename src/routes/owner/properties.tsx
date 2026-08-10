import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "~/lib/auth";
import { OwnerLayout } from "~/lib/owner-layout";
import { useStore } from "~/lib/store";
import { formatCurrency } from "~/lib/data";

export const Route = createFileRoute("/owner/properties")({ component: MyProperties });

export default function MyProperties() {
  const { user } = useAuth();
  const store = useStore();
  const ownerId = user?.ownerId;
  const myProperties = store.properties.filter(p => p.ownerId === ownerId);

  return (
    <OwnerLayout currentPath="/owner/properties">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">My Properties</h1>

        {myProperties.length === 0 ? (
          <p className="text-gray-400">No properties found.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myProperties.map(p => (
              <div key={p.id} className="card p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-gray-900">{p.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{p.address}</p>
                    <div className="flex gap-2 mt-2">
                      <span className={`badge text-[10px] ${p.type === "short-term" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                        {p.type === "short-term" ? "Short-term" : "Long-term"}
                      </span>
                      <span className={`badge text-[10px] ${p.status === "occupied" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                        {p.status}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    {p.type === "short-term" ? (
                      <p className="text-sm font-bold" style={{ color: "#0f3c52" }}>
                        {p.nightlyRate ? formatCurrency(p.nightlyRate) : "—"}<span className="text-xs text-gray-400 font-normal">/night</span>
                      </p>
                    ) : (
                      <p className="text-sm font-bold" style={{ color: "#0f3c52" }}>
                        {formatCurrency(p.monthlyRent || 0)}<span className="text-xs text-gray-400 font-normal">/mo</span>
                      </p>
                    )}
                    <p className="text-[10px] text-gray-400">{p.bedrooms}bd • {p.bathrooms}ba • {p.sqft} sqft</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </OwnerLayout>
  );
}
