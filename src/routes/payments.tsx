// Standalone Payments tab removed (owner Aug 20): payments are managed from
// each reservation via Collect guest card/ACH + Charge Saved Card/ACH, and the
// payment-onboarding wizard lives under Settings → Payment Settings. Keep this
// route alive as a redirect so any old /payments links never 404.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
export const Route = createFileRoute("/payments")({
  component: PaymentsRedirect,
});
function PaymentsRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "/bookings", replace: true });
  }, [navigate]);
  return null;
}
