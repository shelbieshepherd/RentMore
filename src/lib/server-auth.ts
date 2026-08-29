// RentVue — Server-side authentication guard for data-layer RPC handlers.
//
// SECURITY BOUNDARY (2026-08-29, task dc8250e1): the ~60 data-layer createServerFn
// handlers in db-queries.ts previously trusted a client-supplied companyId with no
// session/ownership check — the DashboardLayout redirect was a client-side UX guard,
// not a security boundary. Anyone able to invoke a fetch* fn with a valid companyId
// could read/mutate that company's data.
//
// This module adds the server-side boundary:
//   - requireCompanyAuth : middleware for handlers whose input carries `companyId`.
//     Resolves the authenticated user's REAL company from the session cookie and the
//     users table, then requires it to equal the requested companyId, else 403.
//   - resolveAuthCompany  : reads the session cookie and returns {userId, companyId}
//     (seed users resolve to the demo company; DB users resolve to their real row).
//   - assertCompanyOwner  : inline helper for id-only handlers (bookingId/propertyId/
//     methodId/…) to require an authenticated user whose company owns the resource.
//
// The session cookie is client-set (non-HttpOnly), so it is treated as a user-ID
// pointer only — the company is re-derived from the users table on every request,
// never trusted from the cookie's own companyId field.

import { createMiddleware } from "@tanstack/react-start";
import { sql } from "~/db";

// Demo company (seed users resolve here). Kept as a stable literal to avoid a
// circular import with db-queries.ts (db-queries imports these helpers).
const DEMO_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

// Seed users are not real DB rows; they belong to the demo company.
const SEED_USER_IDS = new Set(["u1", "u2", "u3", "u4", "u-demo", "u5", "u6", "u7"]);

export { DEMO_COMPANY_ID };

function parseSessionUserId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const p = part.trim();
    if (p.startsWith("rentvue_session=")) {
      try {
        const parsed = JSON.parse(decodeURIComponent(p.slice("rentvue_session=".length)));
        return typeof parsed?.id === "string" ? parsed.id : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Resolve the authenticated user's real company from the session cookie. */
export async function resolveAuthCompany(
  request?: Request | null,
): Promise<{ userId: string; companyId: string } | null> {
  if (!request) return null;
  const userId = parseSessionUserId(request.headers.get("cookie"));
  if (!userId) return null;
  if (SEED_USER_IDS.has(userId)) return { userId, companyId: DEMO_COMPANY_ID };
  try {
    const rows = await sql()`SELECT company_id FROM users WHERE id = ${userId}::uuid LIMIT 1`;
    if (!rows.length) return null;
    return { userId, companyId: String(rows[0].company_id) };
  } catch {
    return null;
  }
}

export const denied = () =>
  new Response(JSON.stringify({ error: "Forbidden" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Middleware: require an authenticated user whose company equals the `companyId`
 * in the handler input. Returns 403 immediately for unauthenticated callers or a
 * company mismatch. Apply to every companyId-bearing data handler.
 */
export const requireCompanyAuth = createMiddleware().server(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async ({ next, data, request }: any) => {
    const auth = await resolveAuthCompany(request as Request | undefined);
    const companyId = (data as { companyId?: string } | undefined)?.companyId;
    if (!auth || !companyId || auth.companyId !== companyId) return denied();
    return next({ context: { authUserId: auth.userId } });
  },
);

/**
 * Inline guard for id-only handlers (input has no companyId, e.g. bookingId).
 * Resolves the authenticated company, compares to the owning resource's company,
 * and throws "Forbidden" (rejecting before any mutation) on mismatch.
 */
export async function assertCompanyOwner(
  request: Request | undefined,
  resourceCompany: string | null | undefined,
): Promise<string> {
  const auth = await resolveAuthCompany(request);
  if (!auth || !resourceCompany || auth.companyId !== resourceCompany) {
    throw new Error("Forbidden");
  }
  return auth.companyId;
}
