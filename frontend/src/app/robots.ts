import type { MetadataRoute } from "next";

import { robotsFor, siteUrl } from "@/lib/site";

// robots.txt.
export default function robots(): MetadataRoute.Robots {
  return robotsFor(siteUrl());
}
