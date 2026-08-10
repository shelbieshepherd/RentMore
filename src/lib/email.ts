/**
 * Email templates for Eastman Premier Rentals.
 * Generates PDF-like HTML for lease agreements, rental docs, and guest communication.
 * Emails are queued via POST to /api/send-email — the serve.ts handler writes them to a shared queue file.
 */

const BRAND_COLOR = "#0f3c52";

export interface EmailPayload {
  to: string;
  toName: string;
  subject: string;
  html: string;
}

/** POST email payload to /api/send-email — serve.ts writes it to the shared queue. */
export async function queueEmail(payload: EmailPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const resp = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      let errText = "";
      try {
        errText = await resp.text();
      } catch {
        errText = `HTTP ${resp.status} ${resp.statusText}`;
      }
      console.error("[RentVue] Queue request failed:", { status: resp.status, statusText: resp.statusText, body: errText });
      return { success: false, error: errText || `HTTP ${resp.status}` };
    }
    return { success: true };
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error("[RentVue] Queue fetch error:", { message: msg, error: err });
    return { success: false, error: msg || "Network error — could not reach the server." };
  }
}

/** Base wrapper for all Eastman Premier Rentals HTML emails */
function emailWrapper(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background-color:${BRAND_COLOR};padding:28px 40px;text-align:center;">
              <p style="margin:0;font-size:28px;">🏘️</p>
              <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">Eastman Premier Rentals</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">${title}</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;padding:16px 40px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">
                Powered by <span style="color:#6b7280;">RentVue</span>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** PDF-like lease / rental agreement email */
export function leaseEmailTemplate(params: {
  guestName: string;
  propertyName: string;
  propertyAddress: string;
  documentTitle: string;
  documentContent: string;
  signingLink: string;
  checkIn?: string;
  checkOut?: string;
  nightlyRate?: string;
}): string {
  const content = `
    <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">Hello ${escapeHtml(params.guestName)},</p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7;">
      Please review and sign the following document for your stay at
      <strong style="color:${BRAND_COLOR};">${escapeHtml(params.propertyName)}</strong>.
    </p>

    <!-- Property Card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px;">
      <tr>
        <td style="padding:20px 24px;">
          <h3 style="margin:0 0 12px;color:${BRAND_COLOR};font-size:14px;font-weight:600;">📋 Property Details</h3>
          <table width="100%" cellpadding="4" cellspacing="0">
            <tr>
              <td style="color:#6b7280;font-size:13px;width:100px;">Property</td>
              <td style="color:#111827;font-size:13px;font-weight:500;">${escapeHtml(params.propertyName)}</td>
            </tr>
            <tr>
              <td style="color:#6b7280;font-size:13px;">Address</td>
              <td style="color:#111827;font-size:13px;">${escapeHtml(params.propertyAddress)}</td>
            </tr>
            ${params.checkIn ? `
            <tr>
              <td style="color:#6b7280;font-size:13px;">Check-in</td>
              <td style="color:#111827;font-size:13px;">${params.checkIn}</td>
            </tr>` : ""}
            ${params.checkOut ? `
            <tr>
              <td style="color:#6b7280;font-size:13px;">Check-out</td>
              <td style="color:#111827;font-size:13px;">${params.checkOut}</td>
            </tr>` : ""}
            ${params.nightlyRate ? `
            <tr>
              <td style="color:#6b7280;font-size:13px;">Rate</td>
              <td style="color:#111827;font-size:13px;">${params.nightlyRate}/night</td>
            </tr>` : ""}
          </table>
        </td>
      </tr>
    </table>

    <!-- Document Preview -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:2px solid #e5e7eb;border-radius:8px;margin-bottom:24px;">
      <tr>
        <td style="background-color:#f9fafb;padding:12px 24px;border-bottom:1px solid #e5e7eb;">
          <h3 style="margin:0;color:#111827;font-size:13px;font-weight:600;">📄 ${escapeHtml(params.documentTitle)}</h3>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 24px;color:#374151;font-size:13px;line-height:1.8;white-space:pre-wrap;font-family:Georgia,'Times New Roman',serif;">
          ${escapeHtml(params.documentContent).replace(/\n/g, "<br />")}
        </td>
      </tr>
    </table>

    <!-- CTA Button -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      <tr>
        <td align="center">
          <a href="${params.signingLink}" style="display:inline-block;background-color:${BRAND_COLOR};color:#ffffff;text-decoration:none;padding:14px 48px;border-radius:8px;font-size:15px;font-weight:600;">
            ✍️ Sign Document
          </a>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding-top:12px;">
          <p style="margin:0;color:#9ca3af;font-size:11px;">
            Or copy and paste this link:<br />
            <span style="color:#6b7280;">${params.signingLink}</span>
          </p>
        </td>
      </tr>
    </table>

    <p style="margin:24px 0 0;color:#6b7280;font-size:12px;line-height:1.6;">
      This document requires your electronic signature. Once signed, it becomes legally binding.
      If you have any questions, please contact your property manager before signing.
    </p>`;

  return emailWrapper(title, content);
}

/** Standard guest communication email */
export function guestEmailTemplate(params: {
  guestName: string;
  body: string;
  propertyName?: string;
  bookingId?: string;
}): string {
  const contactLink = params.bookingId
    ? `https://6cb00109005ce5add83d71c194d57d02.ctonew.app/contact?booking=${params.bookingId}`
    : "https://6cb00109005ce5add83d71c194d57d02.ctonew.app/contact";
  const portalLink = params.bookingId
    ? `https://6cb00109005ce5add83d71c194d57d02.ctonew.app/guest/${params.bookingId}`
    : null;
  const content = `
    <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">Hello ${escapeHtml(params.guestName)},</p>
    ${params.propertyName ? `<p style="margin:0 0 16px;color:#374151;font-size:14px;">Re: <strong style="color:${BRAND_COLOR};">${escapeHtml(params.propertyName)}</strong></p>` : ""}
    <div style="color:#374151;font-size:14px;line-height:1.8;white-space:pre-wrap;">
      ${escapeHtml(params.body).replace(/\n/g, "<br />")}
    </div>${portalLink ? `
    <!-- Guest Portal CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
      <tr>
        <td style="background-color:#f0f7fa;border:1px solid #d0e4ed;border-radius:10px;padding:20px 24px;text-align:center;">
          <p style="margin:0 0 8px;font-size:22px;">🏠</p>
          <p style="margin:0 0 4px;color:#0f3c52;font-size:15px;font-weight:700;">Your Guest Portal</p>
          <p style="margin:0 0 16px;color:#6b7280;font-size:12px;">Door codes, Wi-Fi, house rules, local guidebook & more — all in one place.</p>
          <a href="${portalLink}" style="display:inline-block;background-color:#0f3c52;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;">
            🏠 View Your Guest Portal
          </a>
        </td>
      </tr>
    </table>` : ""}
    <p style="margin:24px 0 0;color:#6b7280;font-size:12px;">
      — Eastman Premier Rentals
    </p>
    <p style="margin:8px 0 0;color:#9ca3af;font-size:11px;">
      📩 <a href="${contactLink}" style="color:#0f3c52;">Contact us</a> if you have any questions.
    </p>`;

  return emailWrapper("Message from Eastman Premier Rentals", content);
}

function escapeHtml(str: string): string {
  if (str == null) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
