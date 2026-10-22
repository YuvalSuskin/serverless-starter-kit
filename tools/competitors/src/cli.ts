// pnpm competitors: the entry point.
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import type { Collected } from "./ingest.ts";

import { check } from "./check.ts";
import { DEFAULT_MARKET, findGooglePlaces } from "./collectors/google.ts";
import { fetchGoogle } from "./fetch.ts";
import { REPO_ROOT } from "./files.ts";
import { politeFetcher } from "./http.ts";
import { ingest } from "./ingest.ts";
import { mergeInsights, pending } from "./insights.ts";
import { DEFAULT_CACHE, renderPage } from "./render.ts";
import { findSerpApiKey, mainCheckoutRoot } from "./secrets.ts";
import { stats } from "./stats.ts";

const USAGE = `pnpm competitors check [slug] [--against <git ref>]   validate docs/competitors/
pnpm competitors fetch google <slug> [--hl <lang>]      collect the confirmed listing, then ingest it
pnpm competitors find google "<query>" [--gl <country>] [--hl <lang>]
                                                        candidate Google places (one SerpApi search)
                                                        --gl and --hl: the market's country and language (default us, en)
pnpm competitors render <url> --slug <slug> [--scroll] [--click <text>] [--cache <dir>]
                                                        save a page, rendered, as HTML and text
pnpm competitors stats <slug> | --all [--as-of <date>]  the counts and tables profiles and the landscape show
pnpm competitors ingest <slug> <file.json>              add collected records to raw/
pnpm competitors pending <slug> [--all] [--out <file>]  raw records with no insight yet (--all: every one)
pnpm competitors insights <slug> <file.json> [--retag]  add tagged entries to insights.yaml
Every command takes --root <dir> (default: this repo).`;

/** The SerpApi key, from the environment or a .env.local (never printed). */
function serpApiKey(): string {
  const key = findSerpApiKey(process.env, REPO_ROOT, mainCheckoutRoot(REPO_ROOT));
  if (key === undefined) {
    throw new Error(
      `No SerpApi key: set SERPAPI_API_KEY, or put SERPAPI_API_KEY=<key> in .env.local at ${mainCheckoutRoot(REPO_ROOT)}`,
    );
  }
  return key;
}

/** Today as YYYY-MM-DD in the machine's own time zone. */
const today = () => new Date().toLocaleDateString("sv-SE");
const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));

type Values = Record<string, unknown>;
type Handler = (
  root: string,
  args: (string | undefined)[],
  values: Values,
) => number | Promise<number | undefined> | undefined;

// Each returns an exit code, or undefined when its arguments are missing.
const COMMANDS: Record<string, Handler> = {
  check: (root, [slug], values) => {
    const problems = check(root, {
      ...(slug === undefined ? {} : { slug }),
      ...(typeof values.against === "string" ? { against: values.against } : {}),
    });
    for (const problem of problems) console.log(`${problem.file}: ${problem.message}`);
    return problems.length === 0 ? 0 : 1;
  },
  fetch: async (root, [source, slug], values) => {
    if (slug === undefined) return undefined;
    if (source !== "google") return undefined;
    const report = await fetchGoogle(
      root,
      slug,
      politeFetcher({ source }),
      serpApiKey(),
      today(),
      typeof values.hl === "string" ? { hl: values.hl } : {},
    );
    console.log(JSON.stringify(report, null, 2));
    return 0;
  },
  find: async (_root, [source, query], values) => {
    if (source !== "google" || query === undefined) return undefined;
    const places = await findGooglePlaces(query, serpApiKey(), politeFetcher({ source }), {
      ...DEFAULT_MARKET,
      ...(typeof values.gl === "string" ? { gl: values.gl } : {}),
      ...(typeof values.hl === "string" ? { hl: values.hl } : {}),
    });
    console.log(JSON.stringify({ places, searchesUsed: 1 }, null, 2));
    return 0;
  },
  ingest: (root, [slug, file]) => {
    if (slug === undefined || file === undefined) return undefined;
    console.log(JSON.stringify(ingest(root, slug, readJson(file) as Collected, today()), null, 2));
    return 0;
  },
  insights: (root, [slug, file], values) => {
    if (slug === undefined || file === undefined) return undefined;
    const entries = readJson(file);
    if (!Array.isArray(entries)) throw new Error(`${file}: must be a JSON list of insight entries`);
    console.log(
      JSON.stringify(mergeInsights(root, slug, entries, { retag: values.retag === true })),
    );
    return 0;
  },
  render: async (_root, [url], values) => {
    if (url === undefined || typeof values.slug !== "string") return undefined;
    const saved = await renderPage(url, {
      cacheDir: typeof values.cache === "string" ? values.cache : DEFAULT_CACHE,
      ...(typeof values.click === "string" ? { click: values.click } : {}),
      scroll: values.scroll === true,
      slug: values.slug,
    });
    console.log(JSON.stringify(saved, null, 2));
    return 0;
  },
  stats: (root, [slug], values) => {
    if ((slug === undefined) === (values.all !== true)) return undefined; // one or the other
    const asOf = typeof values["as-of"] === "string" ? values["as-of"] : today();
    process.stdout.write(stats(root, { asOf, ...(values.all === true ? {} : { slug }) }));
    return 0;
  },
  pending: (root, [slug], values) => {
    if (slug === undefined) return undefined;
    const records = pending(root, slug, { all: values.all === true });
    if (typeof values.out !== "string") {
      console.log(JSON.stringify(records, null, 2));
      return 0;
    }
    writeFileSync(values.out, `${JSON.stringify(records, null, 2)}\n`);
    console.log(JSON.stringify({ pending: records.length, written: values.out }));
    return 0;
  },
};

async function main(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    args: argv[0] === "--" ? argv.slice(1) : argv,
    options: {
      against: { type: "string" },
      all: { default: false, type: "boolean" },
      "as-of": { type: "string" },
      cache: { type: "string" },
      click: { type: "string" },
      gl: { type: "string" },
      help: { default: false, short: "h", type: "boolean" },
      hl: { type: "string" },
      out: { type: "string" },
      retag: { default: false, type: "boolean" },
      root: { type: "string" },
      scroll: { default: false, type: "boolean" },
      slug: { type: "string" },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const [command = "", ...rest] = positionals;
  const handler = COMMANDS[command];
  try {
    const code = await handler?.(values.root ?? REPO_ROOT, rest, values);
    if (code !== undefined) return code;
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
  console.log(USAGE);
  return 2;
}

process.exitCode = await main(process.argv.slice(2));
