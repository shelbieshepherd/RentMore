// Production server. Safari fix: replace SSR router state with minimal
// CSR config to avoid React 19 error #418 (hydrateRoot on <html>).
import handler from "./dist/server/server.js";

const PORT = 3000;
const HOST = "0.0.0.0";
const CLIENT_DIR = `${import.meta.dir}/dist/client`;

const SAFARI_RE = /^((?!chrome|android).)*safari/i;

function cleanHtml(buf: ArrayBuffer): ArrayBuffer {
  let text = new TextDecoder().decode(buf);
  text = text.replace(/\x00/g, "/");
  text = text.replace(/i:"([^"]+)\/"/g, 'i:"$1"');
  text = text.replace(/lastMatchId:"([^"]+)\/"/g, 'lastMatchId:"$1"');
  text = text.replace(/\s+async(?:=(?:["']{2})?)?(?=\s|[>\/])/g, "");
  text = text.replace(/async:!0/g, "async:!1");
  return new TextEncoder().encode(text).buffer;
}

// For Safari: replace the complex $_TSR.router IIFE with a minimal
// client-side config. ssr:!1 signals CSR, and the minimal manifest
// lets TanStack Router bootstrap without crashing on hydration.
function safarify(buf: ArrayBuffer): ArrayBuffer {
  let text = new TextDecoder().decode(buf);
  text = text.replace(
    /\$_TSR\.router=\(.+?\)\(/,
    '$_TSR.router={manifest:{routes:{__root__:{}}},matches:[{i:"__root__",u:0,s:"pending",ssr:!1}],lastMatchId:"__root__"};void('
  );
  return new TextEncoder().encode(text).buffer;
}

const freePort =
  `for _ in $(seq 1 25); do ` +
  `pids=$(lsof -t -iTCP:${String(PORT)} -sTCP:LISTEN 2>/dev/null || true); ` +
  `if [ -z "$pids" ]; then exit 0; fi; ` +
  `kill $pids 2>/dev/null || true; sleep 0.2; ` +
  `done`;

for (let attempt = 1; ; attempt++) {
  await Bun.$`sudo sh -c ${freePort}`.quiet().nothrow();
  try {
    Bun.serve({
      port: PORT,
      hostname: HOST,
      async fetch(req) {
        const { pathname } = new URL(req.url);
        const ua = req.headers.get("user-agent") || "";
        const isSafari = SAFARI_RE.test(ua);

        // Email queue API — writes to shared queue file for the lead agent
        // Stripe webhook (Chunk D) - signature-verified reconciliation. Handled
        // here (raw POST; Stripe can't hit a CSRF-protected server fn) with the
        // shared handler also wired into vercel-entry.ts for production.
        if (pathname === "/api/stripe/webhook" && req.method === "POST") {
          try {
            const { handleStripeWebhook } = await import("./src/lib/stripe-webhook");
            const rawBody = await req.text();
            return handleStripeWebhook(rawBody, req.headers.get("stripe-signature"));
          } catch (err: any) {
            console.error("[RentMore] stripe webhook error:", err?.message);
            return new Response(JSON.stringify({ error: "internal" }), {
              status: 500,
              headers: { "content-type": "application/json" },
            });
          }
        }
        // TEMPORARY one-shot Stripe diagnostic (mirror of vercel-entry.ts) — remove after use.
        if (pathname === "/api/stripe/diag" && req.method === "POST") {
          try {
            const { handleStripeDiagnostic, diagnosticRequestAllowed } = await import("./src/lib/stripe-diagnostic");
            const rawBody = await req.text();
            if (!diagnosticRequestAllowed(rawBody)) {
              return new Response(JSON.stringify({ error: "not found" }), {
                status: 404,
                headers: { "content-type": "application/json" },
              });
            }
            return new Response(JSON.stringify(await handleStripeDiagnostic()), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          } catch (err: any) {
            console.error("[RentMore] stripe diag error:", err?.message);
            return new Response(JSON.stringify({ error: "internal" }), {
              status: 500,
              headers: { "content-type": "application/json" },
            });
          }
        }
        if (pathname === "/api/send-email" && req.method === "POST") {
          try {
            const body = await req.json() as { to: string; toName?: string; subject: string; html: string };
            if (!body.to || !body.subject || !body.html) {
              return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
            }
            const fs = await import("node:fs");
            const dir = "/home/team/shared/email-queue";
            fs.mkdirSync(dir, { recursive: true });
            const entry = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              queuedAt: new Date().toISOString(),
              to: body.to,
              toName: body.toName || "",
              subject: body.subject,
              html: body.html,
            };
            fs.appendFileSync(`${dir}/email-queue.jsonl`, JSON.stringify(entry) + "\n");
            console.log("[RentVue] Email queued for", body.to);
            return new Response(JSON.stringify({ success: true }), {
              headers: { "Content-Type": "application/json" },
            });
          } catch (err: any) {
            console.error("[RentVue] Queue error:", err.message);
            return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 });
          }
        }

        if (pathname !== "/") {
          const file = Bun.file(CLIENT_DIR + pathname);
          if (await file.exists()) return new Response(file);
        }

        const resp = await (
          handler as { fetch: (r: Request) => Response | Promise<Response> }
        ).fetch(req);

        const ct = resp.headers.get("content-type") || "";
        if (ct.includes("text/html")) {
          let body = await resp.arrayBuffer();
          body = cleanHtml(body);
          if (isSafari) body = safarify(body);
          return new Response(body, {
            status: resp.status,
            headers: resp.headers,
          });
        }
        return resp;
      },
    });
    break;
  } catch (err) {
    if (attempt >= 10) throw err;
    await Bun.sleep(200);
  }
}

console.log(`team-site serving on http://${HOST}:${String(PORT)}`);
