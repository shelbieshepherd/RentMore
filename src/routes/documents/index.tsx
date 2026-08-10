import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout } from "~/lib/layout";
import { useStore } from "~/lib/store";
import { queueEmail, leaseEmailTemplate } from "~/lib/email";

export const Route = createFileRoute("/documents/")({
  component: DocumentsPage,
});

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-blue-100 text-blue-700",
  viewed: "bg-purple-100 text-purple-700",
  "renter-signed": "bg-amber-100 text-amber-700",
  "fully-executed": "bg-green-100 text-green-700",
};

export default function DocumentsPage() {
  const { signedDocuments, properties, addDocument } = useStore();
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterProperty, setFilterProperty] = useState("all");
  const [showNewModal, setShowNewModal] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const [newDocType, setNewDocType] = useState<"lease" | "rental-agreement" | "owner-agreement">("rental-agreement");
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocRecipient, setNewDocRecipient] = useState("");
  const [newDocRecipientEmail, setNewDocRecipientEmail] = useState("");
  const [newDocPropertyId, setNewDocPropertyId] = useState(properties[0]?.id || "");
  const [newDocContent, setNewDocContent] = useState("");

  const filtered = signedDocuments.filter(d => {
    if (filterStatus !== "all" && d.status !== filterStatus) return false;
    if (filterType !== "all" && d.type !== filterType) return false;
    if (filterProperty !== "all" && d.propertyId !== filterProperty) return false;
    return true;
  });

  const types = ["all", "lease", "rental-agreement", "owner-agreement"];
  const statuses = ["all", "draft", "sent", "viewed", "renter-signed", "fully-executed"];

  function handleNewDoc() {
    if (!newDocTitle || !newDocRecipient || !newDocRecipientEmail || !newDocPropertyId) return;
    const prop = properties.find(p => p.id === newDocPropertyId);
    addDocument({
      propertyId: newDocPropertyId,
      ownerId: prop?.ownerId || "",
      type: newDocType,
      title: newDocTitle,
      sentTo: newDocRecipientEmail,
      sentToName: newDocRecipient,
      status: "draft",
      content: newDocContent,
      createdAt: new Date().toISOString(),
    });
    setShowNewModal(false);
    setNewDocTitle(""); setNewDocRecipient(""); setNewDocContent("");
  }

  const [sendStatus, setSendStatus] = useState<Record<string, string>>({});

  // Email compose modal state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailPreview, setEmailPreview] = useState(false);
  const [emailHtml, setEmailHtml] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailError, setEmailError] = useState("");
  const [currentDoc, setCurrentDoc] = useState<typeof signedDocuments[0] | null>(null);

  function generateEmailHtml(doc: typeof signedDocuments[0] | null, message: string): string {
    if (!doc) return "";
    const signingLink = `https://6cb00109005ce5add83d71c194d57d02.ctonew.app/sign/${doc.id}`;
    const prop = properties.find(p => p.id === doc.propertyId);
    const fullContent = message ? `${message}\n\n---\n\n${doc.content}` : doc.content;
    return leaseEmailTemplate({
      guestName: doc.sentToName,
      propertyName: prop?.name || "your rental",
      propertyAddress: prop?.address || "",
      documentTitle: doc.title,
      documentContent: fullContent,
      signingLink,
    });
  }

  function openEmailModal(doc: typeof signedDocuments[0]) {
    setCurrentDoc(doc);
    setEmailSubject(`Please sign: ${doc.title}`);
    setEmailMessage(`Dear ${doc.sentToName},\n\nPlease review and sign the attached document at your earliest convenience.\n\nThank you!`);
    setEmailSent(false);
    setEmailPreview(false);
    setEmailError("");
    setShowEmailModal(true);
  }

  async function sendEmailFromCompose() {
    if (!currentDoc) return;
    setEmailError("");
    const html = generateEmailHtml(currentDoc, emailMessage);
    const result = await queueEmail({
      to: currentDoc.sentTo,
      toName: currentDoc.sentToName,
      subject: emailSubject,
      html,
    });
    if (result.success) {
      setEmailSent(true);
      setSendStatus(prev => ({ ...prev, [currentDoc.id]: "sent" }));
      setTimeout(() => {
        setShowEmailModal(false);
        setEmailSent(false);
        setSendStatus(prev => { const n = { ...prev }; delete n[currentDoc.id]; return n; });
      }, 2000);
    } else {
      setEmailError(result.error || "Failed to send. Please try again.");
    }
  }

  async function sendEmailFromPreview() {
    if (!currentDoc) return;
    setEmailError("");
    const result = await queueEmail({
      to: currentDoc.sentTo,
      toName: currentDoc.sentToName,
      subject: emailSubject,
      html: emailHtml,
    });
    if (result.success) {
      setEmailSent(true);
      setEmailPreview(false);
      setSendStatus(prev => ({ ...prev, [currentDoc.id]: "sent" }));
      setTimeout(() => {
        setShowEmailModal(false);
        setEmailSent(false);
        setSendStatus(prev => { const n = { ...prev }; delete n[currentDoc.id]; return n; });
      }, 2000);
    } else {
      setEmailError(result.error || "Failed to send. Please try again.");
      setEmailPreview(false);
    }
  }

  function handleSend(doc: typeof signedDocuments[0]) {
    openEmailModal(doc);
  }

  function downloadDoc(doc: typeof signedDocuments[0]) {
    const text = `${doc.title}\n\n${doc.content}\n\nStatus: ${doc.status}${doc.signedByName ? `\nSigned by: ${doc.signedByName}\nSigned on: ${doc.signedAt ? new Date(doc.signedAt).toLocaleDateString() : ""}` : ""}`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const previewDoc = preview ? signedDocuments.find(d => d.id === preview) : null;

  return (
    <DashboardLayout currentPath="/documents">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
            <p className="text-sm text-gray-500">Lease & rental agreement e-signing</p>
          </div>
          <button onClick={() => setShowNewModal(true)} className="btn-primary gap-2">
            ✍️ New Document
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select className="input-field w-36" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            {statuses.map(s => <option key={s} value={s}>{s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          <select className="input-field w-40" value={filterType} onChange={e => setFilterType(e.target.value)}>
            {types.map(t => <option key={t} value={t}>{t === "all" ? "All Types" : t.replace("-", " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
          </select>
          <select className="input-field w-48" value={filterProperty} onChange={e => setFilterProperty(e.target.value)}>
            <option value="all">All Properties</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-6 py-3">Document</th>
                  <th className="text-left px-6 py-3">Recipient</th>
                  <th className="text-left px-6 py-3">Type</th>
                  <th className="text-left px-6 py-3">Property</th>
                  <th className="text-left px-6 py-3">Status</th>
                  <th className="text-left px-6 py-3">Date</th>
                  <th className="text-right px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(d => {
                  const prop = properties.find(p => p.id === d.propertyId);
                  return (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium cursor-pointer hover:text-[#0f3c52]" onClick={() => setPreview(d.id)}>
                        {d.title}
                      </td>
                      <td className="px-6 py-3 text-gray-500">{d.sentToName}<br /><span className="text-xs text-gray-400">{d.sentTo}</span></td>
                      <td className="px-6 py-3"><span className="badge bg-gray-100 text-gray-600 capitalize">{d.type.replace("-", " ")}</span></td>
                      <td className="px-6 py-3 text-gray-500">{prop?.name || "—"}</td>
                      <td className="px-6 py-3"><span className={`badge text-xs ${statusColors[d.status] || ""}`}>{d.status}</span></td>
                      <td className="px-6 py-3 text-gray-400 text-xs">{new Date(d.createdAt).toLocaleDateString()}</td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          {d.status !== "renter-signed" && d.status !== "fully-executed" && (
                            <button onClick={() => handleSend(d)} className="text-xs text-[#0f3c52] hover:underline">
                              {sendStatus[d.id] === "sent" ? "✅ Sent!" : "📤 Send"}
                            </button>
                          )}
                          <button onClick={() => downloadDoc(d)} className="text-xs text-[#0f3c52] hover:underline">📥</button>
                          <button onClick={() => setPreview(d.id)} className="text-xs text-[#0f3c52] hover:underline">👁</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-400">No documents found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* New Document Modal */}
        {showNewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/30" onClick={() => setShowNewModal(false)} />
            <div className="relative z-10 bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-lg font-semibold">✍️ New Document</h2>
                <button onClick={() => setShowNewModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                  <select className="input-field w-full" value={newDocType} onChange={e => setNewDocType(e.target.value as typeof newDocType)}>
                    <option value="rental-agreement">Rental Agreement</option>
                    <option value="lease">Lease Agreement</option>
                    <option value="owner-agreement">Owner Agreement</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Property</label>
                  <select className="input-field w-full" value={newDocPropertyId} onChange={e => setNewDocPropertyId(e.target.value)}>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
                  <input className="input-field w-full" value={newDocTitle} onChange={e => setNewDocTitle(e.target.value)} placeholder="e.g. Rental Agreement — Sunset Villa" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Recipient Name</label>
                    <input className="input-field w-full" value={newDocRecipient} onChange={e => setNewDocRecipient(e.target.value)} placeholder="Name" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Recipient Email</label>
                    <input className="input-field w-full" value={newDocRecipientEmail} onChange={e => setNewDocRecipientEmail(e.target.value)} placeholder="email@example.com" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Content</label>
                  <textarea className="input-field w-full" rows={6} value={newDocContent} onChange={e => setNewDocContent(e.target.value)} placeholder="Document body..." />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowNewModal(false)} className="flex-1 btn-secondary">Cancel</button>
                  <button onClick={handleNewDoc} className="flex-1 btn-accent">Create Document</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Preview Modal */}
        {previewDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/30" onClick={() => setPreview(null)} />
            <div className="relative z-10 bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-lg font-semibold">{previewDoc.title}</h2>
                <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-400">Status:</span> <span className={`badge ${statusColors[previewDoc.status]}`}>{previewDoc.status}</span></div>
                  <div><span className="text-gray-400">Type:</span> <span className="capitalize">{previewDoc.type.replace("-", " ")}</span></div>
                  <div><span className="text-gray-400">To:</span> {previewDoc.sentToName} ({previewDoc.sentTo})</div>
                  <div><span className="text-gray-400">Created:</span> {new Date(previewDoc.createdAt).toLocaleDateString()}</div>
                  {previewDoc.signedByName && <div><span className="text-gray-400">Signed by:</span> {previewDoc.signedByName}</div>}
                  {previewDoc.signedAt && <div><span className="text-gray-400">Signed on:</span> {new Date(previewDoc.signedAt).toLocaleDateString()}</div>}
                </div>
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 whitespace-pre-wrap font-mono text-sm text-gray-700 max-h-64 overflow-y-auto">
                  {previewDoc.content}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { setPreview(null); }} className="flex-1 btn-secondary">Close</button>
                  <button onClick={() => { downloadDoc(previewDoc); }} className="flex-1 btn-accent">📥 Download</button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Email Compose + Preview Modal */}
        {showEmailModal && currentDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/30" onClick={() => setShowEmailModal(false)} />
            <div className="relative z-10 bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-lg mx-4">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-lg font-semibold">✉️ Send Document</h2>
                <button onClick={() => setShowEmailModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>
              {emailSent ? (
                <div className="p-6 text-center">
                  <div className="text-4xl mb-3">✅</div>
                  <p className="text-gray-900 font-medium">Email queued for delivery!</p>
                  <p className="text-xs text-gray-400 mt-1">Closing automatically…</p>
                </div>
              ) : emailPreview ? (
                <div className="p-6 space-y-4">
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">Sending to</p>
                    <p className="text-sm font-medium text-gray-900">{currentDoc.sentToName} &lt;{currentDoc.sentTo}&gt;</p>
                    <p className="text-xs text-gray-400 mt-0.5">Subject: {emailSubject}</p>
                  </div>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-100 px-3 py-1.5 border-b border-gray-200">
                      <span className="text-xs text-gray-500 font-medium">Email Preview</span>
                    </div>
                    <iframe
                      srcDoc={emailHtml}
                      className="w-full"
                      style={{ height: "380px", border: "none" }}
                      sandbox="allow-same-origin"
                      title="Email Preview"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setEmailPreview(false)} className="flex-1 btn-secondary">← Back to Edit</button>
                    <button onClick={sendEmailFromPreview} className="flex-1 btn-accent">Send Email</button>
                  </div>
                </div>
              ) : (
                <div className="p-6 space-y-4">
                  {emailError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                      {emailError}
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                    <input className="input-field bg-gray-50 text-gray-500 w-full" readOnly value={currentDoc.sentTo} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">To Name</label>
                    <input className="input-field bg-gray-50 text-gray-500 w-full" readOnly value={currentDoc.sentToName} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
                    <input className="input-field w-full" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Message</label>
                    <textarea className="input-field w-full" rows={6} value={emailMessage} onChange={e => setEmailMessage(e.target.value)} />
                    <p className="text-xs text-gray-400 mt-1">Document link will be included in the email.</p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setShowEmailModal(false)} className="btn-secondary">Cancel</button>
                    <button
                      onClick={() => {
                        setEmailHtml(generateEmailHtml(currentDoc, emailMessage));
                        setEmailPreview(true);
                      }}
                      className="btn-secondary"
                    >
                      👁 Preview
                    </button>
                    <button onClick={sendEmailFromCompose} className="flex-1 btn-accent">
                      Send Email
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
