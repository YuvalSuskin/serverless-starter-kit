import type { MetadataRoute } from "next";

import { sitemapFor, siteUrl } from "@/lib/site";

// sitemap.xml: the public pages only.
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapFor(siteUrl());
}
