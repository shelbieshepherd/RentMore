import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { DashboardLayout } from "~/lib/layout";
import { useStore } from "~/lib/store";
import type { DocumentTemplate } from "~/lib/data";

export const Route = createFileRoute("/documents/templates")({ component: TemplatesPage });

const typeColors: Record<string, string> = {
  lease: "bg-purple-100 text-purple-700",
  "rental-agreement": "bg-blue-100 text-blue-700",
  "house-rules": "bg-amber-100 text-amber-700",
  "owner-agreement": "bg-teal-100 text-teal-700",
  other: "bg-gray-100 text-gray-600",
};

const PLACEHOLDERS = [
  "{{guestName}}", "{{guestEmail}}", "{{propertyName}}", "{{propertyAddress}}",
  "{{checkInDate}}", "{{checkOutDate}}", "{{nights}}", "{{nightlyRate}}",
  "{{totalAmount}}", "{{depositAmount}}", "{{today}}", "{{ownerName}}",
];

export default function TemplatesPage() {
  const store = useStore();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState<DocumentTemplate["type"]>("rental-agreement");
  const [content, setContent] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function openNew() {
    setEditingId(null);
    setName("");
    setType("rental-agreement");
    setContent("");
    setShowModal(true);
  }

  function openEdit(tmpl: DocumentTemplate) {
    setEditingId(tmpl.id);
    setName(tmpl.name);
    setType(tmpl.type);
    setContent(tmpl.content);
    setShowModal(true);
  }

  function save() {
    if (!name.trim() || !content.trim()) return;
    if (editingId) {
      store.updateTemplate(editingId, { name: name.trim(), type, content });
    } else {
      store.addTemplate({ name: name.trim(), type, content, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    setShowModal(false);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setExtracting(true);
    setExtractError("");

    try {
      if (file.name.endsWith(".docx")) {
        const mammoth = await import("mammoth");
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        setContent(prev => prev ? prev + "\n\n" + result.value : result.value);
      } else if (file.name.endsWith(".pdf")) {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const pages: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const text = textContent.items.map((item: any) => item.str).join(" ");
          pages.push(text);
        }
        const fullText = pages.join("\n\n");
        setContent(prev => prev ? prev + "\n\n" + fullText : fullText);
      }
    } catch (err: any) {
      setExtractError(err?.message || "Failed to extract text from file.");
    } finally {
      setExtracting(false);
      // Reset file input so the same file can be re-uploaded
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleDelete(id: string) {
    if (confirm("Delete this template?")) {
      store.deleteTemplate(id);
    }
  }

  return (
    <DashboardLayout currentPath="/documents/templates">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Document Templates</h1>
            <p className="text-sm text-gray-500">Reusable templates with auto-fill placeholders</p>
          </div>
          <button onClick={openNew} className="btn-primary gap-2">
            📄 New Template
          </button>
        </div>

        {/* Placeholder reference */}
        <div className="card p-4 bg-gray-50">
          <p className="text-xs font-medium text-gray-500 mb-2 uppercase">Available Placeholders</p>
          <div className="flex flex-wrap gap-1.5">
            {PLACEHOLDERS.map(p => (
              <code key={p} className="text-xs bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-600 font-mono">{p}</code>
            ))}
          </div>
        </div>

        {/* Template list */}
        <div className="space-y-3">
          {store.documentTemplates.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">📄</div>
              <p>No templates yet. Create your first template.</p>
            </div>
          ) : (
            store.documentTemplates.map(tmpl => (
              <div key={tmpl.id} className="card p-4 flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900">{tmpl.name}</span>
                    <span className={`badge text-xs ${typeColors[tmpl.type] || ""}`}>{tmpl.type.replace("-", " ")}</span>
                  </div>
                  <p className="text-xs text-gray-400 font-mono truncate max-w-lg">{tmpl.content.slice(0, 120)}...</p>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <button onClick={() => openEdit(tmpl)} className="text-xs text-[#0f3c52] hover:underline">✏️ Edit</button>
                  <button onClick={() => handleDelete(tmpl.id)} className="text-xs text-red-500 hover:underline">🗑</button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* New/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/30" onClick={() => setShowModal(false)} />
            <div className="relative z-10 bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-lg font-semibold">{editingId ? "Edit Template" : "New Template"}</h2>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Template Name</label>
                    <input className="input-field w-full" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Standard Lease" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                    <select className="input-field w-full" value={type} onChange={e => setType(e.target.value as DocumentTemplate["type"])}>
                      <option value="lease">Lease Agreement</option>
                      <option value="rental-agreement">Rental Agreement</option>
                      <option value="house-rules">House Rules</option>
                      <option value="owner-agreement">Owner Agreement</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Content <span className="text-gray-300">— use {"{{placeholders}}"}</span>
                  </label>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {PLACEHOLDERS.map(p => (
                      <button key={p} type="button" onClick={() => setContent(content + " " + p + " ")} className="text-[10px] bg-gray-100 hover:bg-gray-200 rounded px-1.5 py-0.5 text-gray-500 font-mono">{p}</button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <input ref={fileInputRef} type="file" accept=".docx,.pdf" onChange={handleFileUpload} className="hidden" />
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs text-[#0f3c52] hover:underline flex items-center gap-1" disabled={extracting}>
                      {extracting ? "⏳ Extracting text..." : "📎 Upload file"}
                    </button>
                    <span className="text-[10px] text-gray-400">.docx or .pdf</span>
                    {extractError && <span className="text-[10px] text-red-500">{extractError}</span>}
                  </div>
                  <textarea className="input-field w-full font-mono text-sm" rows={14} value={content} onChange={e => setContent(e.target.value)}
                    placeholder="Type template content here... Use {{placeholders}} for auto-fill..." />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowModal(false)} className="flex-1 btn-secondary">Cancel</button>
                  <button onClick={save} className="flex-1 btn-accent">{editingId ? "Save Changes" : "Create Template"}</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
