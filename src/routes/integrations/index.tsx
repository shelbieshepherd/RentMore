import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { DashboardLayout } from "~/lib/layout";
import {
  OTA_PROVIDER_LABELS,
  type OtaProvider,
} from "~/lib/ota/types";
import {
  getConnections, getConnectionByProvider, addConnection, removeConnection,
  getOtaListings, getOtaReservations, getSyncLog,
} from "~/lib/ota/store";
import { syncConnection } from "~/lib/ota/sync-engine";
import * as airbnb from "~/lib/ota/providers/airbnb";
import * as bookingcom from "~/lib/ota/providers/bookingcom";
import * as vrbo from "~/lib/ota/providers/vrbo";

export const Route = createFileRoute("/integrations/")({
  component: IntegrationsPage,
});

const ALL_PROVIDERS: OtaProvider[] = ["airbnb", "bookingcom", "vrbo"];

function IntegrationsPage() {
  const [connections, setConnections] = useState(getConnections());
  const [syncStatus, setSyncStatus] = useState<Record<string, string>>({});
  const [apiKeyInput, setApiKeyInput] = useState<Record<string, string>>({});
  const [showApiKey, setShowApiKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = () => setConnections(getConnections());

  const handleConnect = (provider: OtaProvider) => {
    if (provider === "airbnb") {
      if (!airbnb.hasCredentials()) {
        setSyncStatus(s => ({ ...s, airbnb: "Credentials not configured (needs partner approval)" }));
        return;
      }
      // In real: redirect to OAuth URL
      const conn = addConnection("airbnb", "Airbnb Connection", {
        accessToken: `mock_airbnb_${Date.now()}`,
        refreshToken: `mock_airbnb_refresh_${Date.now()}`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      });
      refresh();
      setSyncStatus(s => ({ ...s, airbnb: "Connected (mock)" }));
    } else if (provider === "vrbo") {
      if (!vrbo.hasCredentials()) {
        setSyncStatus(s => ({ ...s, vrbo: "Credentials not configured (needs partner approval)" }));
        return;
      }
      const conn = addConnection("vrbo", "VRBO Connection", {
        accessToken: `mock_vrbo_${Date.now()}`,
        refreshToken: `mock_vrbo_refresh_${Date.now()}`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      });
      refresh();
      setSyncStatus(s => ({ ...s, vrbo: "Connected (mock)" }));
    } else if (provider === "bookingcom") {
      const existing = getConnectionByProvider("bookingcom");
      if (existing) return;
      // Use entered API key or empty
      const conn = addConnection("bookingcom", "Booking.com Connection", {
        apiKey: apiKeyInput.bookingcom || "",
      });
      refresh();
      setSyncStatus(s => ({ ...s, bookingcom: "Connected" }));
      setShowApiKey(null);
    }
  };

  const handleDisconnect = (provider: OtaProvider) => {
    const conn = getConnectionByProvider(provider);
    if (conn) removeConnection(conn.id);
    refresh();
  };

  const handleSync = async (provider: OtaProvider) => {
    const conn = getConnectionByProvider(provider);
    if (!conn) return;
    setSyncStatus(s => ({ ...s, [provider]: "Syncing..." }));
    const result = await syncConnection(conn.id);
    setSyncStatus(s => ({ ...s, [provider]: result.success ? "Synced ✓" : `Error: ${result.error}` }));
    refresh();
    setTimeout(refresh, 500);
  };

  const canConfigure = (provider: OtaProvider) => {
    if (provider === "airbnb") return airbnb.hasCredentials();
    if (provider === "vrbo") return vrbo.hasCredentials();
    if (provider === "bookingcom") return true; // API key, always configurable
    return false;
  };

  return (
    <DashboardLayout currentPath="/integrations">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
          <p className="text-sm text-gray-500 mt-1">Connect to external booking platforms for calendar sync and reservation import</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {ALL_PROVIDERS.map(provider => {
            const info = OTA_PROVIDER_LABELS[provider];
            const conn = getConnectionByProvider(provider);
            const isConnected = conn && conn.status !== "disconnected";
            const isSyncing = conn?.status === "syncing";
            const listings = isConnected ? getOtaListings(conn?.id) : [];
            const reservations = isConnected ? getOtaReservations(conn?.id) : [];
            const statusMsg = syncStatus[provider] || (isConnected ? (conn?.status || "connected") : "Not connected");

            return (
              <div key={provider} className="card p-5 space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{info.icon}</span>
                    <div>
                      <h3 className="font-semibold text-gray-900">{info.name}</h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className={`w-2 h-2 rounded-full ${isConnected ? (conn?.status === "error" ? "bg-red-500" : "bg-green-500") : "bg-gray-300"}`}
                        />
                        <span className="text-xs text-gray-500 capitalize">{statusMsg}</span>
                      </div>
                    </div>
                  </div>
                  {isConnected ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleSync(provider)}
                        disabled={isSyncing}
                        className="px-2 py-1 text-[10px] rounded font-medium bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50"
                      >
                        {isSyncing ? "⋯" : "Sync"}
                      </button>
                      <button
                        onClick={() => handleDisconnect(provider)}
                        className="px-2 py-1 text-[10px] rounded font-medium bg-red-50 text-red-600 hover:bg-red-100"
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <div>
                      {!canConfigure(provider) ? (
                        <span className="text-[10px] text-gray-400 italic">Needs partner approval</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {provider === "bookingcom" && (
                            <>
                              {showApiKey === provider ? (
                                <div className="flex gap-1">
                                  <input
                                    className="input-field text-[10px] w-28"
                                    placeholder="API key"
                                    value={apiKeyInput.bookingcom || ""}
                                    onChange={e => setApiKeyInput(s => ({ ...s, bookingcom: e.target.value }))}
                                  />
                                  <button onClick={() => handleConnect(provider)} className="px-2 py-1 text-[10px] rounded font-medium text-white" style={{ backgroundColor: info.color }}>
                                    OK
                                  </button>
                                </div>
                              ) : (
                                <button onClick={() => setShowApiKey(provider)} className="px-3 py-1 text-xs rounded font-medium text-white" style={{ backgroundColor: info.color }}>
                                  Connect
                                </button>
                              )}
                            </>
                          )}
                          {(provider === "airbnb" || provider === "vrbo") && (
                            <button onClick={() => handleConnect(provider)} className="px-3 py-1 text-xs rounded font-medium text-white" style={{ backgroundColor: info.color }}>
                              Connect
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Stats */}
                {isConnected && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-gray-400">Listings</p>
                      <p className="font-bold text-gray-700">{listings.length}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-gray-400">Reservations</p>
                      <p className="font-bold text-gray-700">{reservations.length}</p>
                    </div>
                  </div>
                )}

                {/* Last synced */}
                {conn?.lastSyncedAt && (
                  <p className="text-[10px] text-gray-400">
                    Last synced: {new Date(conn.lastSyncedAt).toLocaleString()}
                  </p>
                )}

                {/* Expandable listings */}
                {isConnected && listings.length > 0 && (
                  <div>
                    <button
                      onClick={() => setExpanded(expanded === provider ? null : provider)}
                      className="text-xs text-[#0f3c52] hover:underline"
                    >
                      {expanded === provider ? "Hide" : "Show"} listings ({listings.length})
                    </button>
                    {expanded === provider && (
                      <div className="mt-2 space-y-1.5">
                        {listings.map(l => (
                          <Link
                            key={l.id}
                            to="/integrations/$provider"
                            params={{ provider }}
                            className="block p-2 bg-gray-50 rounded-lg text-xs hover:bg-gray-100"
                          >
                            <p className="font-medium text-gray-700">{l.title}</p>
                            <p className="text-gray-400">{l.bedrooms}BR · {l.bathrooms}BA · {l.maxGuests} guests</p>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
