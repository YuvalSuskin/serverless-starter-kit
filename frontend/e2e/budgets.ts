// Skeleton: the budgets of the template's pages, replaced by bootstrap step 6.
// Performance budgets per path: what a page may load up to its load event
// (JavaScript: until it has settled, 2 s later), measured exactly, so a
// regression fails `pnpm e2e` instead of showing up later as a lower Lighthouse
// score. Numbers are compressed bytes on the wire. Each tier's budgets sit
// about 10% above what its pages load today: raise one only on purpose, in a
// reviewed change that says why, never to make a failing change pass.
//
// To cover a new page, add its path to PAGES under its tier.

interface Budget {
  /** Preloaded fonts (link rel=preload as=font), in the HTML or its headers. */
  fontPreloads: number;
  /** Fonts fetched up to the load event, KB. */
  fontKb: number;
  /** Images fetched up to the load event, KB. */
  imageKb: number;
  /** Every request up to the load event. */
  requests: number;
  /** JavaScript fetched until the page has settled (2 s after load), KB. */
  scriptKb: number;
  /** Stylesheets fetched up to the load event, KB. */
  styleKb: number;
}

// The template's numbers, measured on 2026-10-22 on its pages with the bundled
// Inter font (JavaScript 157 KB, CSS 6 KB, font 47 KB, no preloaded font, no
// image, 12 requests on the busiest page), then set 10% above for the public
// pages. The app tier keeps the looser numbers it had, as a signed-in tool's
// should be. Bootstrap steps 4 to 6 re-measure them for the project's own
// font and pages; a real project's tiers are its own: public pages held
// tight, the signed-in tool looser.
export const TIERS = {
  // The public pages: first impressions and search, on a phone with a weak signal.
  marketing: {
    fontKb: 52,
    fontPreloads: 0,
    imageKb: 0,
    requests: 14,
    scriptKb: 173,
    styleKb: 7,
  },
  // The app pages: people at a desk or on site, looser.
  app: {
    fontKb: 52,
    fontPreloads: 0,
    imageKb: 100,
    requests: 25,
    scriptKb: 200,
    styleKb: 10,
  },
} satisfies Record<string, Budget>;

export const PAGES: readonly { path: string; tier: keyof typeof TIERS }[] = [
  { path: "/", tier: "marketing" },
  { path: "/contact", tier: "marketing" },
  // The root not-found page: static, with no client code of its own.
  { path: "/no-such-page", tier: "marketing" },
  { path: "/messages", tier: "app" },
];
