import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore } from "~/lib/store";
import { queueEmail } from "~/lib/email";

export const Route = createFileRoute("/contact")({
  component: ContactPage,
});

// Change this to the property manager's email address
const MANAGER_EMAIL = "manager@rentvue.com";

function ContactPage() {
  const store = useStore();

  // Pre-fill from ?booking= URL param
  const searchParams = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : null;
  const bookingId = searchParams?.get("booking") || "";
  const booking = bookingId ? store.bookings.find(b => b.id === bookingId) : undefined;
  const property = booking ? store.properties.find(p => p.id === booking.propertyId) : undefined;

  const defaultName = booking?.guestName || "";
  const defaultSubject = booking
    ? `Question about stay at ${property?.name || "your property"}`
    : "";

  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState("");
  const [bookingRef, setBookingRef] = useState(booking ? `${property?.name || "Property"} — ${booking.guestName}` : "");
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    setSending(true);
    setError("");

    const emailBody = [
      `Sender: ${name} (${email})`,
      bookingRef ? `Property / Booking: ${bookingRef}` : "",
      `Subject: ${subject}`,
      "",
      "--- Message ---",
      message,
    ].filter(Boolean).join("\n");

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
<tr><td style="background:#0f3c52;padding:24px 32px;text-align:center;">
<p style="margin:0;font-size:24px;">🏘️</p>
<h1 style="margin:6px 0 0;color:#fff;font-size:18px;font-weight:700;">Eastman Premier Rentals</h1>
<p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:12px;">Guest Message</p>
</td></tr>
<tr><td style="padding:28px 32px;">
<table width="100%" cellpadding="6" cellspacing="0" style="margin-bottom:20px;">
<tr><td style="color:#6b7280;font-size:13px;width:80px;">From</td><td style="color:#111827;font-size:13px;font-weight:500;">${name} (${email})</td></tr>
${bookingRef ? `<tr><td style="color:#6b7280;font-size:13px;">Booking</td><td style="color:#111827;font-size:13px;">${bookingRef}</td></tr>` : ""}
<tr><td style="color:#6b7280;font-size:13px;">Subject</td><td style="color:#111827;font-size:13px;">${subject}</td></tr>
</table>
<div style="border-top:1px solid #e5e7eb;padding-top:16px;color:#374151;font-size:14px;line-height:1.7;white-space:pre-wrap;">${message}</div>
</td></tr>
<tr><td style="background:#f9fafb;padding:14px 32px;border-top:1px solid #e5e7eb;">
<p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">Powered by <span style="color:#6b7280;">RentMore</span></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

    const result = await queueEmail({
      to: MANAGER_EMAIL,
      toName: "Property Manager",
      subject: `[Guest Message] ${subject}`,
      html,
    });

    if (result.success) {
      setSent(true);
    } else {
      setError(result.error || "Failed to send message. Please try again.");
    }
    setSending(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {/* Header */}
          <div className="px-8 py-6" style={{ backgroundColor: "#0f3c52" }}>
            <div className="text-3xl mb-1">🏘️</div>
            <h1 className="text-xl font-bold text-white">Eastman Premier Rentals</h1>
            <p className="text-sm text-white/70">Contact Us &middot; Powered by RentMore</p>
          </div>

          <div className="p-8">
            {sent ? (
              <div className="text-center py-8">
                <div className="text-5xl mb-4">✅</div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Message sent!</h2>
                <p className="text-gray-500">We'll get back to you soon.</p>
              </div>
            ) : (
              <>
                {booking && property && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6 text-sm text-blue-800">
                    📅 Messaging about your stay at <strong>{property.name}</strong>,{" "}
                    {new Date(booking.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {" – "}
                    {new Date(booking.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
                    <input
                      className="input-field w-full"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Your full name"
                      required
                      readOnly={!!booking}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Email *</label>
                    <input
                      className="input-field w-full"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Booking / Property (optional)</label>
                    <input
                      className="input-field w-full"
                      value={bookingRef}
                      onChange={e => setBookingRef(e.target.value)}
                      placeholder="e.g. Sunset Villa"
                      readOnly={!!booking}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Subject *</label>
                    <input
                      className="input-field w-full"
                      value={subject}
                      onChange={e => setSubject(e.target.value)}
                      placeholder="What is this about?"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Message *</label>
                    <textarea
                      className="input-field w-full"
                      rows={6}
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      placeholder="Your message..."
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={sending}
                    className="w-full py-3 rounded-lg text-white font-semibold"
                    style={{ backgroundColor: sending ? "#6b7280" : "#0f3c52" }}
                  >
                    {sending ? "Sending…" : "📩 Send Message"}
                  </button>
                </form>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 border-t border-gray-100 px-8 py-3 text-center">
            <p className="text-xs text-gray-400">
              Powered by <span className="text-gray-500">RentMore</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
