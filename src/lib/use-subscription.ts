// Client-side subscription paywall hook.
// Fetches the company's subscription status (tier, expiry, active flag) and
// exposes a banner + gate helpers for the Properties/Bookings create CTAs.
// Demo company (00000000-0000-0000-0000-000000000001) is always active.
import { useEffect, useState } from "react";
import { useAuth } from "./auth";

export interface SubscriptionStatus {
  tier: string | null;
  expiresAt: string | null;
  active: boolean;
  isDemo: boolean;
  loading: boolean;
}

export const DEFAULT_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

export function useSubscriptionStatus(): SubscriptionStatus {
  const { user } = useAuth();
  const companyId = user?.companyId || null;
  const [status, setStatus] = useState<SubscriptionStatus>({
    tier: null,
    expiresAt: null,
    active: true, // optimistic — flip to real value after fetch
    isDemo: false,
    loading: true,
  });

  useEffect(() => {
    if (!companyId) return;
    if (companyId === DEFAULT_COMPANY_ID) {
      setStatus({ tier: "demo", expiresAt: null, active: true, isDemo: true, loading: false });
      return;
    }
    let cancelled = false;
    import("~/lib/db-queries")
      .then(({ fetchSubscriptionStatus }) =>
        fetchSubscriptionStatus({ data: { companyId } }),
      )
      .then((res: any) => {
        if (cancelled) return;
        setStatus({
          tier: res?.tier ?? null,
          expiresAt: res?.expiresAt ?? null,
          active: !!res?.active,
          isDemo: !!res?.isDemo,
          loading: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        // On fetch failure default to open (fail-open) so the app is never
        // bricked by a transient DB/network error; the server-side gate in
        // insertProperty/insertBooking remains the hard enforcement.
        setStatus((s) => ({ ...s, loading: false, active: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return status;
}

// Friendly message used by both the banner and the disabled-CTA tooltip.
export const PLAN_INACTIVE_MSG =
  "Your plan is inactive — renew to keep using RentMore";
