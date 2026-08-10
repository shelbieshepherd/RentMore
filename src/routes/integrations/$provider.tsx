import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout } from "~/lib/layout";
import { properties, formatCurrency, formatDate } from "~/lib/data";
import { OTA_PROVIDER_LABELS, type OtaProvider } from "~/lib/ota/types";
import {
  getConnectionByProvider, removeConnection,
  getOtaListings, linkOtaListing,
  getOtaReservations, getSyncLog,
} from "~/lib/ota/store";
import { syncConnection } from "~/lib/ota/sync-engine";

export const Route = createFileRoute("/integrations/$provider")({
  component: ProviderDetailPage,
});

function ProviderDetailPage() {
  const params = Route.useParams() as { provider: OtaProvider };
  const provider = params.provider;
  const info = OTA_PROVIDER_LABELS[provider];

  const conn = getConnectionByProvider(provider);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const listings = conn ? getOtaListings(conn.id) : [];
  const reservations = conn ? getOtaReservations(conn.id) : [];
  const syncLog = conn ? getSyncLog(conn.id, 20) : [];

  const handleSync = async () => {
    if (!conn) return;
    setSyncing(true);
    setSyncResult(null);
    const result = await syncConnection(conn.id);
    setSyncResult(result.success ? "Sync completed successfully ✓" : `Sync failed: ${result.error}`);
    setSyncing(false);
  };

  const handleDisconnect = () => {
    if (!conn) return;
    removeConnection(conn.id);
    window.location.href = "/integrations";
  };

  const handleMapProperty = (listingId: string, rentvuePropertyId: string) => {
    linkOtaListing(listingId, rentvuePropertyId || null);
    // Force re-render
    setSyncResult(s => s); // trigger render
  };

  if (!conn) {
    return (
      <DashboardLayout currentPath="/integrations">
        <div className="space-y-4">
          <Link to="/integrations" className="text-sm text-[#0f3c52] hover:underline">← Back to Integrations</Link>
          <div className="card p-8 text-center">
            <p className="text-gray-500">No connection found for {info.name}.</p>
            <Link to="/integrations" className="text-[#0f3c52] text-sm mt-2 inline-block hover:underline">Set up connection</Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout currentPath="/integrations">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <Link to="/integrations" className="text-sm text-[#0f3c52] hover:underline">← Back to Integrations</Link>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-3xl">{info.icon}</span>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{info.name}</h1>
              <p className="text-sm text-gray-500">
                Status: <span className={`font-medium capitalize ${conn.status === "connected" ? "text-green-600" : conn.status === "error" ? "text-red-600" : "text-gray-600"}`}>{conn.status}</span>
                {conn.lastSyncedAt && ` · Last synced: ${new Date(conn.lastSyncedAt).toLocaleString()}`}
              </p>
              {conn.errorMessage && <p className="text-xs text-red-500 mt-1">{conn.errorMessage}</p>}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button onClick={handleSync} disabled={syncing} className="btn-accent text-sm">
            {syncing ? "Syncing..." : "Sync Now"}
          </button>
          <button onClick={handleDisconnect} className="btn-secondary text-sm text-red-600">
            Disconnect
          </button>
          {syncResult && (
            <span className={`text-sm ${syncResult.includes("success") ? "text-green-600" : "text-red-600"}`}>
              {syncResult}
            </span>
          )}
        </div>

        {/* Listings */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">OTA Listings ({listings.length})</h2>
          {listings.length === 0 ? (
            <p className="text-sm text-gray-400">No listings pulled yet. Sync to fetch.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="text-left px-3 py-2">OTA Listing</th>
                    <th className="text-left px-3 py-2">Details</th>
                    <th className="text-left px-3 py-2">Rate</th>
                    <th className="text-left px-3 py-2">Mapped Property</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {listings.map(l => {
                    const mappedProp = l.rentvuePropertyId
                      ? properties.find(p => p.id === l.rentvuePropertyId)
                      : null;
                    return (
                      <tr key={l.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-800">{l.title}</p>
                          <a href={l.url} target="_blank" rel="noopener" className="text-[10px] text-blue-500 hover:underline">{l.url}</a>
                        </td>
                        <td className="px-3 py-2 text-gray-500">
                          {l.bedrooms}BR · {l.bathrooms}BA · {l.maxGuests} guests
                        </td>
                        <td className="px-3 py-2 text-gray-700 font-medium">
                          {formatCurrency(l.nightlyRate)}/night
                        </td>
                        <td className="px-3 py-2">
                          {mappedProp ? (
                            <span className="badge bg-green-100 text-green-800 text-[10px]">{mappedProp.name}</span>
                          ) : (
                            <select
                              className="input-field text-[10px] py-0.5 w-36"
                              onChange={e => handleMapProperty(l.id, e.target.value)}
                              value={l.rentvuePropertyId || ""}
                            >
                              <option value="">— Unmapped —</option>
                              {properties.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Reservations */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">OTA Reservations ({reservations.length})</h2>
          {reservations.length === 0 ? (
            <p className="text-sm text-gray-400">No reservations pulled yet. Sync to fetch.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="text-left px-3 py-2">Guest</th>
                    <th className="text-left px-3 py-2">Dates</th>
                    <th className="text-left px-3 py-2">Amount</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Imported</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reservations.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-800">{r.guestName}</p>
                        <p className="text-[10px] text-gray-400">{r.guestEmail}</p>
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {formatDate(r.checkIn)} → {formatDate(r.checkOut)}
                      </td>
                      <td className="px-3 py-2 text-gray-700 font-medium">
                        {formatCurrency(r.totalAmount)}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`badge text-[10px] ${r.status === "confirmed" ? "bg-blue-100 text-blue-800" : r.status === "cancelled" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}`}>{r.status}</span>
                      </td>
                      <td className="px-3 py-2">
                        {r.rentvueBookingId ? (
                          <span className="badge bg-green-100 text-green-800 text-[10px]">✓ Imported</span>
                        ) : (
                          <span className="badge bg-gray-100 text-gray-500 text-[10px]">Pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sync Log */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Sync Log</h2>
          {syncLog.length === 0 ? (
            <p className="text-sm text-gray-400">No sync activity yet.</p>
          ) : (
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-1.5">Time</th>
                    <th className="text-left px-3 py-1.5">Action</th>
                    <th className="text-left px-3 py-1.5">Result</th>
                    <th className="text-left px-3 py-1.5">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {syncLog.map(log => (
                    <tr key={log.id}>
                      <td className="px-3 py-1.5 text-gray-400 whitespace-nowrap">{new Date(log.timestamp).toLocaleTimeString()}</td>
                      <td className="px-3 py-1.5 font-medium text-gray-700">{log.action}</td>
                      <td className="px-3 py-1.5">
                        <span className={`badge text-[9px] ${log.result === "success" ? "bg-green-100 text-green-700" : log.result === "error" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`}>{log.result}</span>
                      </td>
                      <td className="px-3 py-1.5 text-gray-500 max-w-xs truncate">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
