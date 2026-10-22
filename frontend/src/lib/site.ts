import type { Metadata, MetadataRoute } from "next";

// The public site's address and what search engines and share previews see.
// Read at build: every public page is static.

type Env = Readonly<Record<string, string | undefined>>;

function trimSlashes(text: string, from: "start" | "end"): string {
  let trimmed = text;
  while (from === "end" ? trimmed.endsWith("/") : trimmed.startsWith("/")) {
    trimmed = from === "end" ? trimmed.slice(0, -1) : trimmed.slice(1);
  }
  return trimmed;
}

/** The site's origin, from SITE_URL at build (default https://example.com, a placeholder). */
export function siteUrl(env: Env = process.env): string {
  // An empty SITE_URL (a CI variable that is not set) counts as unset.
  const configured = env.SITE_URL?.trim() ?? "";
  return trimSlashes(configured === "" ? "https://example.com" : configured, "end");
}

/** An address on the site; the home page is the bare origin, as its canonical is. */
export function absoluteUrl(path: string, site: string = siteUrl()): string {
  const rest = trimSlashes(path, "start");
  return rest === "" ? site : `${site}/${rest}`;
}

/** The public layout's metadata: relative addresses resolve on the site. */
export function publicLayoutMetadata(site: string): Metadata {
  return { metadataBase: new URL(site) };
}

/**
 * A public page's metadata. Next merges metadata shallowly, so a page's Open
 * Graph block replaces the layout's: every page builds all of it here. Paths
 * are relative; the public layout sets metadataBase from siteUrl().
 */
export function pageMetadata({
  title,
  description,
  path,
}: Readonly<{
  title?: string;
  description: string;
  path: string;
}>): Metadata {
  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: path },
    openGraph: {
      ...(title ? { title } : {}),
      description,
      url: path,
      siteName: "Acme",
      locale: "en_US",
      type: "website",
    },
    twitter: { card: "summary" },
  };
}

/** The pages in sitemap.xml: the public ones, never the app's. */
const PUBLIC_PATHS = ["/", "/contact"] as const;

/** robots.txt: the public site is open; the app pages and the API are not. */
export function robotsFor(site: string): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/messages", "/api"] },
    sitemap: absoluteUrl("/sitemap.xml", site),
  };
}

/** sitemap.xml: exactly the public pages. */
export function sitemapFor(site: string): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({ url: absoluteUrl(path, site) }));
}
