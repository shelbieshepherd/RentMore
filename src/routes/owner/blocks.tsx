import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "~/lib/auth";
import { OwnerLayout } from "~/lib/owner-layout";
import { useStore } from "~/lib/store";
import { formatDate } from "~/lib/data";
import type { CalendarBlock } from "~/lib/data";

export const Route = createFileRoute("/owner/blocks")({ component: OwnerBlocks });

export default function OwnerBlocks() {
  const { user } = useAuth();
  const store = useStore();
  const ownerId = user?.ownerId;
  const myProperties = store.properties.filter(p => p.ownerId === ownerId);
  const myPropertyIds = myProperties.map(p => p.id);

  // Owner's blocks across all their properties
  const myBlocks = store.calendarBlocks.filter(
    b => myPropertyIds.includes(b.propertyId) && b.type === "blocked"
  );

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState(myProperties[0]?.id || "");
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [blockTitle, setBlockTitle] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleAddBlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProperty || !blockStart || !blockEnd) return;
    store.addCalendarBlock({
      propertyId: selectedProperty,
      type: "blocked",
      startDate: blockStart,
      endDate: blockEnd,
      title: blockTitle || "Owner use",
      color: "#8b5cf6",
    });
    setShowAddModal(false);
    setBlockStart("");
    setBlockEnd("");
    setBlockTitle("");
  };

  const handleDeleteBlock = (id: string) => {
    store.deleteCalendarBlock(id);
    setDeleteConfirm(null);
  };

  return (
    <OwnerLayout currentPath="/owner/blocks">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Owner Blocks</h1>
            <p className="text-sm text-gray-500 mt-1">Block dates for personal use on your properties.</p>
          </div>
          <button onClick={() => setShowAddModal(true)} className="btn-accent text-sm">+ Add Block</button>
        </div>

        <div className="card p-4">
          {myBlocks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No owner blocks yet. Add your first block to reserve dates for personal use.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-gray-400 border-b">
                  <tr>
                    <th className="text-left py-2 font-medium">Property</th>
                    <th className="text-left py-2 font-medium">Title</th>
                    <th className="text-left py-2 font-medium">Dates</th>
                    <th className="text-right py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {myBlocks.map(block => {
                    const prop = myProperties.find(p => p.id === block.propertyId);
                    return (
                      <tr key={block.id} className="border-b border-gray-50">
                        <td className="py-2 text-gray-900">{prop?.name || "Unknown"}</td>
                        <td className="py-2">{block.title}</td>
                        <td className="py-2 text-gray-500">{formatDate(block.startDate)} – {formatDate(block.endDate)}</td>
                        <td className="py-2 text-right">
                          <button
                            onClick={() => setDeleteConfirm(block.id)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add Block Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowAddModal(false)} />
          <div className="relative z-10 bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-sm mx-4">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add Owner Block</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <form onSubmit={handleAddBlock} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Property</label>
                <select className="input-field" value={selectedProperty} onChange={e => setSelectedProperty(e.target.value)} required>
                  {myProperties.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Check-in</label>
                <input className="input-field" type="date" value={blockStart} onChange={e => setBlockStart(e.target.value)} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Check-out</label>
                <input className="input-field" type="date" value={blockEnd} onChange={e => setBlockEnd(e.target.value)} min={blockStart} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Note (optional)</label>
                <input className="input-field" value={blockTitle} onChange={e => setBlockTitle(e.target.value)} placeholder="e.g. Family vacation" />
              </div>
              <button type="submit" className="btn-accent w-full">Add Block</button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={() => setDeleteConfirm(null)} />
          <div className="relative z-10 bg-white rounded-xl shadow-xl border border-gray-100 w-full max-w-sm mx-4 p-6 text-center">
            <div className="text-4xl mb-3">🗑</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Block?</h3>
            <p className="text-sm text-gray-500 mb-5">This will free up these dates for bookings.</p>
            <div className="flex gap-3">
              <button onClick={() => handleDeleteBlock(deleteConfirm)} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">Delete</button>
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </OwnerLayout>
  );
}
