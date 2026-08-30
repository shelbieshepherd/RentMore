import { useEffect } from "react";

/**
 * Shared shell + SEO helpers for public marketing pages (pricing, SEO articles).
 * Visual language matches src/routes/pitch.tsx: #0f3c52 brand, Inter,
 * white background, sticky nav.
 */

const BRAND = "#0f3c52";

/** The canonical production origin for all public marketing pages. Search
 *  engines and social crawlers hit rentmorevrs.com, so every SEO meta tag and
 *  canonical link points there. */
export const SITE_URL = "https://www.rentmorevrs.com";

/** Build a full SEO head() object (title, description, canonical, Open Graph,
 *  Twitter card) for a public marketing page at `path` (e.g. "/pricing"). Pass
 *  to the route's `head: () => seoHead(...)` so the metadata is SSR'd. */
export function seoHead(title: string, description: string, path: string) {
  const url = `${SITE_URL}${path}`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

/** Set <title> + meta description for a page. Used client-side; the CSR app
 *  doesn't always re-render the head on load, so this guarantees correctness. */
export function useSeo(title: string, description: string) {
  useEffect(() => {
    document.title = title;
    let m = document.querySelector('meta[name="description"]');
    if (!m) {
      m = document.createElement("meta");
      m.setAttribute("name", "description");
      document.head.appendChild(m);
    }
    m.setAttribute("content", description);
  }, [title, description]);
}

export function PublicNav() {
  return (
    <nav className="border-b border-gray-100 bg-white/95 sticky top-0 z-50 backdrop-blur">
      <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <a href="/" className="flex items-center gap-2 no-underline">
          <img src="/logo.svg" alt="RentMore" className="h-8 w-auto" />
        </a>
        <div className="flex items-center gap-5 flex-wrap">
          <a href="/pitch" className="text-sm text-gray-600 hover:text-gray-900">Overview</a>
          <a href="/property-management-software" className="text-sm text-gray-600 hover:text-gray-900">Property Mgmt</a>
          <a href="/pricing" className="text-sm text-gray-600 hover:text-gray-900">Pricing</a>
          <a href="/login" className="text-sm text-gray-600 hover:text-gray-900">Log in</a>
          <a
            href="/signup"
            className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-colors"
            style={{ backgroundColor: BRAND }}
          >
            Get started
          </a>
        </div>
      </div>
    </nav>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-gray-100 py-8">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="text-sm text-gray-400">© {new Date().getFullYear()} RentMore. Property management software for short-term and long-term rentals.</span>
        <div className="flex items-center gap-4 flex-wrap">
          <a href="/pitch" className="text-sm text-gray-400 hover:text-gray-600">Overview</a>
          <a href="/property-management-software" className="text-sm text-gray-400 hover:text-gray-600">Property Mgmt</a>
          <a href="/short-term-rental-software" className="text-sm text-gray-400 hover:text-gray-600">Short-Term</a>
          <a href="/vacation-rental-management-software" className="text-sm text-gray-400 hover:text-gray-600">Vacation Rentals</a>
          <a href="/pricing" className="text-sm text-gray-400 hover:text-gray-600">Pricing</a>
          <a href="/login" className="text-sm text-gray-400 hover:text-gray-600">Log in</a>
          <a href="/signup" className="text-sm text-gray-400 hover:text-gray-600">Sign up</a>
        </div>
      </div>
    </footer>
  );
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <PublicNav />
      {children}
      <PublicFooter />
    </div>
  );
}

/** Brand-colored CTA button used at the end of articles and pricing. */
export function CtaButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="inline-block px-8 py-3.5 rounded-lg text-base font-semibold text-white hover:opacity-90 transition-colors shadow-lg"
      style={{ backgroundColor: BRAND }}
    >
      {label}
    </a>
  );
}

export { BRAND };
