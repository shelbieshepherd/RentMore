import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "~/lib/store";
import { signDocument, signDocumentOwner } from "~/lib/shared-store";
import { queueEmail, leaseEmailTemplate } from "~/lib/email";
import { useState } from "react";

export const Route = createFileRoute("/sign/$documentId")({
  component: SignPage,
});

function SignPage() {
  const { documentId } = Route.useParams();
  const { signedDocuments, properties, owners } = useStore();
  const doc = signedDocuments.find(d => d.id === documentId);
  const [signerName, setSignerName] = useState("");
  const [signed, setSigned] = useState(false);
  const [error, setError] = useState("");

  // Detect owner role from URL search params
  const isOwner = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("role") === "owner"
    : false;

  if (!doc) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md mx-4 text-center">
          <div className="text-4xl mb-3">📄</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Document Not Found</h1>
          <p className="text-gray-500">This document may have been removed or the link is incorrect.</p>
        </div>
      </div>
    );
  }

  const property = properties.find(p => p.id === doc.propertyId);
  const owner = owners.find(o => o.id === doc.ownerId);
  const isRenterSigned = doc.status === "renter-signed" || doc.status === "fully-executed";
  const isOwnerSigned = doc.status === "fully-executed";
  const alreadySigned = isOwner ? isOwnerSigned : isRenterSigned || signed;
  const renterName = doc.renterSignedByName || doc.signedByName || "";

  function handleSign() {
    const name = signerName.trim();
    if (!name) {
      setError("Please type your full name to sign.");
      return;
    }
    if (isOwner) {
      signDocumentOwner(doc!.id, name);
    } else {
      signDocument(doc!.id, name);
      // Auto-trigger owner notification email
      const ownerEmail = doc!.ownerEmail || owner?.email;
      if (ownerEmail) {
        const signingLink = `https://rentmorevrs.com/sign/${doc!.id}?role=owner`;
        const html = leaseEmailTemplate({
          guestName: owner?.name || "Property Owner",
          propertyName: property?.name || "your property",
          propertyAddress: property?.address || "",
          documentTitle: `Countersign: ${doc!.title}`,
          documentContent: `The renter (${name}) has signed this document on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.\n\nPlease countersign to fully execute this agreement.`,
          signingLink,
        });
        queueEmail({
          to: ownerEmail,
          toName: owner?.name || "Property Owner",
          subject: `Countersign required: ${doc!.title}`,
          html,
        });
      }
    }
    setSigned(true);
    setError("");
  }

  function handleDownload() {
    const text = `${doc!.title}\n\n${doc!.content}\n\n${
      alreadySigned
        ? `Signed by: ${renterName}\nDate: ${doc.renterSignedAt || doc.signedAt ? new Date((doc.renterSignedAt || doc.signedAt)!).toLocaleDateString() : new Date().toLocaleDateString()}${
            isOwnerSigned ? `\nCountersigned by: ${doc.ownerSignedByName}\nDate: ${new Date(doc.ownerSignedAt!).toLocaleDateString()}` : ""
          }`
        : "Unsigned"
    }`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc!.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {/* Header */}
          <div className="px-8 py-6 border-b border-gray-100" style={{ backgroundColor: "#0f3c52" }}>
            <div className="text-3xl mb-1">🏘️</div>
            <h1 className="text-xl font-bold text-white">Eastman Premier Rentals</h1>
            <p className="text-sm text-white/70">
              {isOwner ? "Owner Countersignature" : "Secure e-signature"} &middot; Powered by RentMore
            </p>
          </div>

          <div className="p-8 space-y-6">
            {/* Renter signature banner for owner view */}
            {isOwner && isRenterSigned && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  📝 <strong>Signed by {renterName}</strong> on{" "}
                  {doc.renterSignedAt
                    ? new Date(doc.renterSignedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
                    : doc.signedAt
                      ? new Date(doc.signedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
                      : "—"}
                </p>
                <p className="text-xs text-blue-600 mt-1">This document is ready for your countersignature.</p>
              </div>
            )}

            {/* Meta */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400 text-xs uppercase">Document</span>
                <p className="font-medium">{doc.title}</p>
              </div>
              <div>
                <span className="text-gray-400 text-xs uppercase">Type</span>
                <p className="font-medium capitalize">{doc.type.replace("-", " ")}</p>
              </div>
              <div>
                <span className="text-gray-400 text-xs uppercase">From</span>
                <p className="font-medium">Eastman Premier Rentals</p>
              </div>
              <div>
                <span className="text-gray-400 text-xs uppercase">Property</span>
                <p className="font-medium">{property?.name || "—"}</p>
              </div>
            </div>

            {/* Document Content */}
            <div className="border border-gray-200 rounded-lg p-6 bg-gray-50 whitespace-pre-wrap font-mono text-sm text-gray-700 max-h-96 overflow-y-auto">
              {doc.content}
            </div>

            {/* Already signed */}
            {alreadySigned ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <div className="text-2xl mb-1">✅</div>
                {isOwnerSigned ? (
                  <>
                    <p className="font-medium text-green-800">
                      <strong>Fully executed</strong> — this document is complete.
                    </p>
                    <p className="text-xs text-green-600 mt-1">
                      Signed by {renterName} &middot; Countersigned by {doc.ownerSignedByName || signerName}
                    </p>
                  </>
                ) : isOwner ? (
                  <p className="font-medium text-green-800">
                    Countersigned by <strong>{doc.ownerSignedByName || signerName}</strong>
                  </p>
                ) : (
                  <>
                    <p className="font-medium text-green-800">
                      Signed by <strong>{renterName}</strong>
                    </p>
                    <p className="text-xs text-amber-600 mt-1">⏳ Awaiting owner countersignature.</p>
                  </>
                )}
              </div>
            ) : (
              /* Signing form */
              <div className="border border-gray-200 rounded-lg p-6 space-y-4">
                <h3 className="font-semibold text-gray-900">
                  {isOwner ? "Countersign this document" : "Sign this document"}
                </h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type your full name to {isOwner ? "countersign" : "sign"}</label>
                  <input
                    type="text"
                    className="input-field w-full text-lg"
                    placeholder={isOwner ? "e.g. Robert Chen" : "e.g. Lisa Thompson"}
                    value={signerName}
                    onChange={e => { setSignerName(e.target.value); setError(""); }}
                  />
                  {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
                </div>

                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>📅</span>
                  <span>Date: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
                </div>

                <button
                  onClick={handleSign}
                  className="w-full py-3 rounded-lg text-white font-semibold text-lg"
                  style={{ backgroundColor: "#0f3c52" }}
                >
                  {isOwner ? "✍️ Countersign Document" : "✍️ Sign Document"}
                </button>

                <p className="text-xs text-gray-400 text-center">
                  By signing, you agree to the terms outlined in this document.
                </p>
              </div>
            )}

            {/* Download */}
            <button onClick={handleDownload} className="btn-secondary w-full gap-2">
              📥 Download {alreadySigned ? "Signed" : ""} Document
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
