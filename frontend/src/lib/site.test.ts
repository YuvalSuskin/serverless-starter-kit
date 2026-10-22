import { describe, expect, it } from "vitest";

import {
  absoluteUrl,
  pageMetadata,
  publicLayoutMetadata,
  robotsFor,
  sitemapFor,
  siteUrl,
} from "./site";

describe("siteUrl", () => {
  it("is the placeholder unless SITE_URL says otherwise", () => {
    expect(siteUrl({})).toBe("https://example.com");
    expect(siteUrl({ SITE_URL: "https://preview.example/" })).toBe("https://preview.example");
  });

  it("treats an empty SITE_URL as unset", () => {
    expect(siteUrl({ SITE_URL: "" })).toBe("https://example.com");
  });
});

describe("absoluteUrl", () => {
  it("joins the site and a path without doubled slashes", () => {
    expect(absoluteUrl("/contact", "https://example.com")).toBe("https://example.com/contact");
    expect(absoluteUrl("/", "https://example.com")).toBe("https://example.com");
  });
});

describe("pageMetadata", () => {
  const meta = pageMetadata({ title: "Contact", description: "Write to us.", path: "/contact" });

  it("gives a canonical address on the site", () => {
    expect(meta.alternates?.canonical).toBe("/contact");
  });

  it("gives a full share preview", () => {
    expect(meta.openGraph).toMatchObject({
      title: "Contact",
      description: "Write to us.",
      url: "/contact",
      locale: "en_US",
      siteName: "Acme",
      type: "website",
    });
    expect(meta.twitter).toMatchObject({ card: "summary" });
  });
});

describe("robotsFor", () => {
  it("lets search engines in, but not into the app pages or the API", () => {
    const robots = robotsFor("https://example.com");
    expect(robots.rules).toEqual({
      userAgent: "*",
      allow: "/",
      disallow: ["/messages", "/api"],
    });
    expect(robots.sitemap).toBe("https://example.com/sitemap.xml");
  });
});

describe("sitemapFor", () => {
  it("lists the public pages only", () => {
    expect(sitemapFor("https://example.com").map((e) => e.url)).toEqual([
      "https://example.com",
      "https://example.com/contact",
    ]);
  });
});

describe("publicLayoutMetadata", () => {
  it("resolves relative addresses on the site", () => {
    expect(String(publicLayoutMetadata("https://example.com").metadataBase)).toBe(
      "https://example.com/",
    );
  });
});
