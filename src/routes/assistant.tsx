import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useRef, useEffect } from "react";
import { DashboardLayout } from "~/lib/layout";
import { useStore } from "~/lib/store";
import { scanOperations, parseAssistantQuery, type Insight } from "~/lib/operations-assistant";

export const Route = createFileRoute("/assistant")({
  component: AssistantPage,
});

const QUICK_CHIPS = [
  "What needs attention?",
  "Show occupancy",
  "Vacant properties",
  "Overdue maintenance?",
  "Who hasn't signed?",
  "Check-ins today",
  "Upcoming bookings",
];

function InsightCard({ insight }: { insight: Insight }) {
  const severityStyles: Record<string, { border: string; bg: string; badge: string; icon: string }> = {
    urgent: { border: "border-l-red-500", bg: "bg-red-50/50", badge: "bg-red-100 text-red-700", icon: "🔴" },
    watch: { border: "border-l-amber-500", bg: "bg-amber-50/50", badge: "bg-amber-100 text-amber-700", icon: "🟡" },
    opportunity: { border: "border-l-emerald-500", bg: "bg-emerald-50/50", badge: "bg-emerald-100 text-emerald-700", icon: "🟢" },
  };
  const s = severityStyles[insight.severity];

  return (
    <a
      href={insight.actionRoute}
      className={`block border-l-4 ${s.border} ${s.bg} rounded-r-lg p-4 hover:shadow-md transition-shadow`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm">{s.icon}</span>
            <h4 className="text-sm font-semibold text-gray-800 truncate">{insight.title}</h4>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">{insight.description}</p>
        </div>
        <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${s.badge}`}>
          {insight.actionLabel} →
        </span>
      </div>
    </a>
  );
}

function AssistantPage() {
  const store = useStore();
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scan = useMemo(() => scanOperations(store), [store]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const sendQuery = (query: string) => {
    if (!query.trim()) return;
    setChatHistory(prev => [...prev, { role: "user", text: query }]);
    const response = parseAssistantQuery(query, store);
    // Small delay to feel natural
    setTimeout(() => {
      setChatHistory(prev => [...prev, { role: "assistant", text: response }]);
    }, 400);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendQuery(chatInput);
    setChatInput("");
  };

  const handleChip = (chip: string) => {
    sendQuery(chip);
  };

  const renderMarkdown = (text: string) => {
    // Simple markdown rendering: bold, line breaks
    const lines = text.split("\n");
    return lines.map((line, i) => {
      // Bold: **text**
      const bolded = line.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>');
      return (
        <span key={i}>
          <span dangerouslySetInnerHTML={{ __html: bolded }} />
          {i < lines.length - 1 && <br />}
        </span>
      );
    });
  };

  return (
    <DashboardLayout currentPath="/assistant">
      <div className="flex flex-col" style={{ height: "calc(100vh - 120px)" }}>
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🧠</span>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Operations Assistant</h1>
              <p className="text-sm text-gray-500">AI-powered insights across your entire portfolio</p>
            </div>
          </div>
        </div>

        {/* Main content: scan results + chat */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
          {/* Left: Insight Sections */}
          <div className="lg:col-span-2 overflow-y-auto space-y-6 pr-1">
            {/* URGENT Section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-base font-bold text-red-700">🔴 URGENT</h2>
                <span className="bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {scan.urgent.length}
                </span>
              </div>
              {scan.urgent.length === 0 ? (
                <div className="bg-gray-50 rounded-lg p-6 text-center">
                  <p className="text-gray-400 text-sm">Nothing urgent — you're in good shape ✅</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {scan.urgent.map(insight => (
                    <InsightCard key={insight.id} insight={insight} />
                  ))}
                </div>
              )}
            </div>

            {/* WATCH Section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-base font-bold text-amber-700">🟡 WATCH</h2>
                <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {scan.watch.length}
                </span>
              </div>
              {scan.watch.length === 0 ? (
                <div className="bg-gray-50 rounded-lg p-6 text-center">
                  <p className="text-gray-400 text-sm">Nothing to watch — everything's on track 👍</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {scan.watch.map(insight => (
                    <InsightCard key={insight.id} insight={insight} />
                  ))}
                </div>
              )}
            </div>

            {/* OPPORTUNITIES Section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-base font-bold text-emerald-700">🟢 OPPORTUNITIES</h2>
                <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {scan.opportunities.length}
                </span>
              </div>
              {scan.opportunities.length === 0 ? (
                <div className="bg-gray-50 rounded-lg p-6 text-center">
                  <p className="text-gray-400 text-sm">No opportunities detected right now</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {scan.opportunities.map(insight => (
                    <InsightCard key={insight.id} insight={insight} />
                  ))}
                </div>
              )}
            </div>

            {/* Bottom padding for scroll */}
            <div className="h-4" />
          </div>

          {/* Right: Chat Panel */}
          <div className="flex flex-col min-h-0 border border-gray-200 rounded-xl bg-white shadow-sm">
            {/* Chat header */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 shrink-0">
              <span className="text-lg">💬</span>
              <h3 className="text-sm font-semibold text-gray-700">Ask Assistant</h3>
            </div>

            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatHistory.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-400 text-sm mb-3">Ask me anything about your operations</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {QUICK_CHIPS.map(chip => (
                      <button
                        key={chip}
                        onClick={() => handleChip(chip)}
                        className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800 transition-colors"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {chatHistory.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
                      msg.role === "user"
                        ? "bg-[#0f3c52] text-white"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {renderMarkdown(msg.text)}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Chat input */}
            <form onSubmit={handleSubmit} className="px-4 py-3 border-t border-gray-100 shrink-0">
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input-field text-sm flex-1"
                  placeholder="Ask about operations..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                />
                <button
                  type="submit"
                  className="btn-accent text-sm px-4"
                  disabled={!chatInput.trim()}
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
