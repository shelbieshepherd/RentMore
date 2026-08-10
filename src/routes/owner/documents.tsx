import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "~/lib/auth";
import { OwnerLayout } from "~/lib/owner-layout";
import { useStore } from "~/lib/store";

export const Route = createFileRoute("/owner/documents")({ component: OwnerDocs });

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-blue-100 text-blue-700",
  viewed: "bg-yellow-100 text-yellow-700",
  signed: "bg-green-100 text-green-700",
};

export default function OwnerDocs() {
  const { user } = useAuth();
  const store = useStore();
  const ownerId = user?.ownerId;
  const myProperties = store.properties.filter(p => p.ownerId === ownerId);
  const myPropIds = new Set(myProperties.map(p => p.id));

  const myDocs = store.signedDocuments.filter(d =>
    myPropIds.has(d.propertyId) || d.ownerId === ownerId
  );

  function downloadDoc(doc: typeof myDocs[0]) {
    const text = `${doc.title}\n\n${doc.content}\n\nStatus: ${doc.status}${doc.signedByName ? `\nSigned by: ${doc.signedByName}\nSigned on: ${doc.signedAt ? new Date(doc.signedAt).toLocaleDateString() : ""}` : ""}`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <OwnerLayout currentPath="/owner/documents">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500">Lease agreements and documents for your properties</p>
        </div>

        {myDocs.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📄</div>
            <p className="text-gray-500">No documents yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {myDocs.map(doc => {
              const prop = store.properties.find(p => p.id === doc.propertyId);
              return (
                <div key={doc.id} className="card p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📄</span>
                    <div>
                      <p className="font-medium text-gray-900">{doc.title}</p>
                      <p className="text-xs text-gray-400">
                        {prop?.name} · {doc.type.replace("-", " ")} · {doc.sentToName}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`badge text-xs ${statusColors[doc.status] || ""}`}>{doc.status}</span>
                    {doc.signedByName && <span className="text-xs text-gray-400">by {doc.signedByName}</span>}
                    <button onClick={() => downloadDoc(doc)} className="text-xs text-[#0f3c52] hover:underline">📥</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </OwnerLayout>
  );
}
