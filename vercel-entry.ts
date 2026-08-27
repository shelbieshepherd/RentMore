// Vercel Build Output API function entry.
//
// The Build Output Node launcher invokes the default export as a classic Node
// `(req, res)` handler — NOT a web handler. TanStack Start emits a portable web
// fetch handler (dist/server/server.js), so we adapt: Node IncomingMessage → web
// Request, run the fetch handler, stream the web Response back onto ServerResponse.
// Node 22 has global Request/Response/Headers/ReadableStream.
//
// Bundled (with its deps + the SSR handler's dynamic ./assets chunks) into
// .vercel/output/functions/render.func/index.mjs by build-vercel.sh.
import type { IncomingMessage, ServerResponse } from "node:http";

import handler from "./dist/server/server.js";

const fetchHandler = handler as {
  fetch: (request: Request) => Response | Promise<Response>;
};

/** Read the raw request body (webhook signatures must verify the exact bytes). */
const readRawBody = async (req: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
};
const toWebRequest = (req: IncomingMessage): Request => {
  const host = req.headers.host ?? "localhost";
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  const url = `${proto}://${host}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else if (value != null) headers.set(key, value);
  }
  const method = req.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  return new Request(url, {
    method,
    headers,
    ...(hasBody
      ? { body: req as unknown as ReadableStream, duplex: "half" }
      : {}),
  } as RequestInit);
};

export default async function vercelHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const url = new URL(req.url ?? "/", "https://www.rentmorevrs.com");
    if (url.pathname === "/api/stripe/webhook" && (req.method ?? "GET") === "POST") {
      try {
        const { handleStripeWebhook } = await import("./src/lib/stripe-webhook");
        const rawBody = await readRawBody(req);
        const sig = (req.headers["stripe-signature"] as string | undefined) ?? null;
        const webRes = await handleStripeWebhook(rawBody, sig);
        res.statusCode = webRes.status;
        webRes.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(await webRes.text());
      } catch (err) {
        console.error("[team-site] stripe webhook failed", err);
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "internal" }));
      }
      return;
    }
    // TEMP smoke-test mint helper (remove after use)
    if (url.pathname === "/api/stripe/mint" && (req.method ?? "GET") === "POST") {
      try {
        const { handleMint } = await import("./src/lib/stripe-mint");
        const bodyText = await readRawBody(req);
        const mintRes = await handleMint(bodyText);
        res.statusCode = mintRes.status;
        res.setHeader("content-type", "application/json");
        res.end(await mintRes.text());
      } catch (err) {
        console.error("[team-site] stripe mint failed", err);
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "internal", detail: (err as any)?.message }));
      }
      return;
    }
    const webRes = await fetchHandler.fetch(toWebRequest(req));
    res.statusCode = webRes.status;
    webRes.headers.forEach((value, key) => res.setHeader(key, value));
    if (webRes.body) {
      const reader = webRes.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  } catch (error) {
    // Log the detail server-side (captured by the host's function logs); never
    // return a stack trace to the public visitor of the site.
    console.error("[team-site] SSR request failed", error);
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain");
    res.end("Internal Server Error");
  }
}
