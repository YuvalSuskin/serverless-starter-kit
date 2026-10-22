// What the proof says about e2e, and whether it covers a pull request (CI
// decisions CI15, CI16, CI17). `pnpm check:full` runs e2e on the production build,
// and its proof (the `local/check-full` status) names, first in its
// description, the projects that ran on it and the Node major. ci.yml's `proof` job
// reads that and passes only when it covers the change; its step "Proof covers
// the change" runs:
//   node tools/local-check/src/cli.ts proof-scope
export const SCOPE_STEP = "Proof covers the change";

export type E2eBuild = "production";
export type E2eCoverage = Record<E2eBuild, string[]>;

export interface MatrixEntry {
  /** Space-separated project names. */
  projects: string;
  /** Space-separated Playwright engines those projects run on. */
  browsers: string;
  build: E2eBuild;
}

/** The engine each e2e project runs on (frontend/playwright.config.ts). */
const ENGINES: Record<string, string> = {
  chromium: "chromium",
  android: "chromium",
  iphone: "webkit",
};

/**
 * Every e2e project on the production build, grouped by engine as CI's e2e
 * jobs were (CI4): Chromium, then WebKit. There is one build: the site has no
 * hidden pages to show or hide, so nothing differs between builds. What a
 * proof must cover when the change affects the frontend.
 */
const JOBS: { build: E2eBuild; projects: string[] }[] = [
  { build: "production", projects: ["chromium", "android"] },
  { build: "production", projects: ["iphone"] },
];

function entry(build: E2eBuild, projects: string[]): MatrixEntry {
  const browsers = [...new Set(projects.map((p) => ENGINES[p] ?? p))];
  return { projects: projects.join(" "), browsers: browsers.join(" "), build };
}

export function fullMatrix(): MatrixEntry[] {
  return JOBS.map((job) => entry(job.build, job.projects));
}

/**
 * The description's first words: the projects that ran on the build, then
 * the Node major the run was made on (CI16):
 * `e2e production:chromium,android,iphone node24`, or `e2e none node24`.
 */
export function coverageToken(coverage: E2eCoverage, node?: number): string {
  const parts = (["production"] as const)
    .filter((build) => coverage[build].length > 0)
    .map((build) => `${build}:${coverage[build].join(",")}`);
  if (parts.length === 0) parts.push("none");
  if (node !== undefined) parts.push(`node${String(node)}`);
  return `e2e ${parts.join(" ")}`;
}

export interface ParsedProof {
  coverage: E2eCoverage;
  /** The Node major the run was made on; undefined when the proof does not say. */
  node: number | undefined;
}

/**
 * What the proof's description says ran. Only the exact form coverageToken
 * writes, at the very start, counts; anything else covers nothing.
 */
export function parseProof(description: string | undefined): ParsedProof {
  const none: ParsedProof = { coverage: { production: [] }, node: undefined };
  const body = /^\[e2e ([^\]]*)\]/.exec(description ?? "")?.[1];
  if (body === undefined) return none;
  const coverage: E2eCoverage = { production: [] };
  let node: number | undefined;
  for (const [at, part] of body.split(" ").entries()) {
    const nodeMatch = /^node(\d{1,3})$/.exec(part);
    if (nodeMatch?.[1] !== undefined) {
      node = Number(nodeMatch[1]);
      continue;
    }
    // `none` stands first and alone, before the Node major.
    if (part === "none" && at === 0) continue;
    const match = /^(production):([a-z0-9-]+(?:,[a-z0-9-]+)*)$/.exec(part);
    if (match?.[1] === undefined || match[2] === undefined) return none;
    coverage[match[1] as E2eBuild].push(...match[2].split(","));
  }
  if (body.startsWith("none") && coverage.production.length > 0) {
    return none;
  }
  return { coverage, node };
}

export interface E2eMatrix {
  entries: MatrixEntry[];
  reason: string;
}

/**
 * The e2e jobs the proof did not cover (CI15): every project on the production build,
 * less what the description names, on the Node major CI runs (CI16).
 */
export function e2eMatrix(opts: {
  event: string | undefined;
  description: string | undefined;
  /** The Node major CI runs (.nvmrc); undefined when it cannot be read. */
  ciNode: number | undefined;
}): E2eMatrix {
  const full = (reason: string): E2eMatrix => ({ entries: fullMatrix(), reason });
  if (opts.event !== "pull_request")
    return full(`the event is not a pull request (${opts.event ?? "unknown"})`);
  if (opts.description === undefined || opts.description === "") {
    return full("no proof for this head");
  }
  const { coverage: covered, node } = parseProof(opts.description);
  if (covered.production.length === 0) {
    return full("the proof does not say it ran e2e");
  }
  // CI16: an e2e pass on another Node major says nothing about CI's Node.
  if (opts.ciNode === undefined) return full("CI's Node major cannot be read");
  if (node !== opts.ciNode) {
    return full(
      node === undefined
        ? `the proof does not say which Node it ran on (CI runs Node ${String(opts.ciNode)})`
        : `the proof ran on Node ${String(node)}, CI runs Node ${String(opts.ciNode)}`,
    );
  }
  const entries = JOBS.flatMap((job) => {
    const left = job.projects.filter((p) => !covered[job.build].includes(p));
    return left.length === 0 ? [] : [entry(job.build, left)];
  });
  return {
    entries,
    reason: `the proof covered ${coverageToken(covered, node).replace(/^e2e /, "")}`,
  };
}

export interface ProofScope {
  ok: boolean;
  reason: string;
}

/**
 * Whether the proof on a pull request's head covers it (CI17): made on the
 * repo's Node major, and, when the change affects the frontend, with every e2e
 * project on the production build. `frontendAffected` is turbo's answer in the job,
 * "true" or "false"; anything else fails, as does anything unreadable.
 */
export function proofScope(opts: {
  description: string | undefined;
  frontendAffected: string | undefined;
  /** The repo's Node major (.nvmrc); undefined when it cannot be read. */
  ciNode: number | undefined;
}): ProofScope {
  const fail = (reason: string): ProofScope => ({ ok: false, reason });
  if (opts.description === undefined || opts.description === "") {
    return fail("no proof for this head");
  }
  if (opts.ciNode === undefined) return fail("the repo's Node major (.nvmrc) cannot be read");
  const { coverage, node } = parseProof(opts.description);
  if (node !== opts.ciNode) {
    return fail(
      node === undefined
        ? `the proof does not say which Node it ran on (the repo runs Node ${String(opts.ciNode)})`
        : `the proof ran on Node ${String(node)}, the repo runs Node ${String(opts.ciNode)}`,
    );
  }
  const ran = coverageToken(coverage, node).replace(/^e2e /, "");
  if (opts.frontendAffected === "false") {
    return { ok: true, reason: `the frontend is not affected; the proof ran ${ran}` };
  }
  if (opts.frontendAffected !== "true") {
    return fail(`what the change affects is unknown (${opts.frontendAffected ?? "no answer"})`);
  }
  const left = e2eMatrix({
    event: "pull_request",
    description: opts.description,
    ciNode: opts.ciNode,
  }).entries;
  if (left.length > 0) {
    const missing = left.map((e) => `${e.build}: ${e.projects}`).join("; ");
    return fail(`the frontend is affected, and the proof did not run e2e on ${missing}`);
  }
  return { ok: true, reason: `the frontend is affected, and the proof ran ${ran}` };
}
