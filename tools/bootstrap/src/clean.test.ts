// The template is clean: no text file in the repo (tracked, or new and not yet
// ignored) names the project it came from, its two AWS accounts, its region,
// its bead IDs, Hebrew text, the shekel sign, or an email address outside the
// domains reserved for examples (`.test`, `.example`, `.invalid`,
// `example.com`/`.org`/`.net`), so no real person's address comes back in a
// fixture. Repo-wide (the template-neutral
// test covers only the harness). The few lines that must name these words,
// because they are the tests that ban them, are listed in ALLOWED with the
// reason for each.
//
// This file is itself such a text file, so it carries none of the words it
// bans: the name, the IDs and the region are joined from parts, and Hebrew and
// the shekel sign are written as escapes inside strings (a regex literal's
// escape is rewritten into the raw character by the formatter; a string's is
// not). None of the patterns holds the placeholder name, so the rename leaves
// them alone. The first project's name also covers its bead IDs.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO = path.join(import.meta.dirname, "../../..");
const NAME = ["kali", "vent"].join("");

const BANNED: readonly { name: string; pattern: RegExp }[] = [
  { name: "the first project's name", pattern: new RegExp(NAME, "i") },
  { name: "an AWS account ID", pattern: new RegExp(["9941", "1660", "1299"].join("")) },
  { name: "an AWS account ID", pattern: new RegExp(["6219", "9670", "0591"].join("")) },
  { name: "the first project's region", pattern: new RegExp(["il", "central", "1"].join("-")) },
  { name: "Hebrew text", pattern: new RegExp("[\\u0590-\\u05FF]", "u") },
  { name: "the shekel sign", pattern: new RegExp("\\u20AA", "u") },
];

// An address: a local part, @, then a dotted domain ending in letters (so
// `react@18.3.1` and `@acme/config` are not addresses). Read around each @ by
// hand, so no pattern backtracks.
const LOCAL = /[\w.%+-]/;
const HOST = /[\w.-]/;
const DOMAIN_END = /\.[a-z]{2,}$/i;

/** Each address-like word in a line: the run of local-part characters, @, the run of host characters. */
function addressesIn(text: string): string[] {
  const found: string[] = [];
  for (let at = text.indexOf("@"); at !== -1; at = text.indexOf("@", at + 1)) {
    let start = at;
    while (start > 0 && LOCAL.test(text.charAt(start - 1))) start -= 1;
    let end = at + 1;
    while (end < text.length && HOST.test(text.charAt(end))) end += 1;
    while (end > at + 1 && text.charAt(end - 1) === ".") end -= 1;
    if (start < at && end > at + 1) found.push(text.slice(start, end));
  }
  return found;
}
const RESERVED = /(?:^|\.)(?:[a-z\d-]+\.(?:test|example|invalid)|example\.(?:com|org|net))$/i;

/** Addresses outside the reserved domains that may stay, each with its reason. */
const ALLOWED_ADDRESSES: Readonly<Record<string, string>> = {
  "noreply@anthropic.com":
    "the agent's Co-Authored-By trailer, which the sweep's timeline test parses as git writes it",
  "you@company.com":
    "a form placeholder in the vendored shadcn skill (.claude/skills/shadcn/, pinned by skills-lock.json)",
  "i@izs.me": "an npm package's deprecation notice that pnpm copies into pnpm-lock.yaml",
};

interface Allowed {
  file: string;
  // The exact line, trimmed. Any other line of the file is still checked.
  line: string;
  reason: string;
}

const ALLOWED: readonly Allowed[] = [
  {
    file: "tools/sweep/src/template-neutral.test.ts",
    line: `/${NAME}|picime|picme|iplan|mit4mit/i.test(readFileSync(f, "utf8")),`,
    reason: "the harness test that bans the first project's name",
  },
  {
    file: "tools/sweep/src/memories.test.ts",
    line: `const named = memories.filter(({ text }) => /${NAME}|\\p{Script=Hebrew}/iu.test(text));`,
    reason: "the seed-memories test that bans the first project's name",
  },
  {
    file: "tools/sweep/src/owner-inbox.test.ts",
    line: `expect(page).not.toMatch(/${NAME}|picime|picme|iplan|mit4mit/i);`,
    reason: "the inbox-page test that bans the first project's name",
  },
];

function trackedFiles(root: string): string[] {
  // Tracked, and untracked but not ignored: a new file is checked before it is
  // committed, not only after (the check on this very file passed untracked once).
  const out = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  return out.split("\0").filter(Boolean);
}

function isBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, 8000).includes(0);
}

/** Every banned word in a tracked text file or file name, as `file:line: what`. */
function findBanned(
  root: string,
  allowed: readonly Allowed[],
  addresses: Readonly<Record<string, string>> = ALLOWED_ADDRESSES,
): string[] {
  const found: string[] = [];
  for (const file of trackedFiles(root)) {
    for (const { name, pattern } of BANNED) {
      if (pattern.test(file)) found.push(`${file}: ${name} in the file's name`);
    }
    let buffer: Buffer;
    try {
      buffer = readFileSync(path.join(root, file));
    } catch {
      continue; // tracked but deleted from the tree
    }
    if (isBinary(buffer)) continue;
    const lines = buffer.toString("utf8").split("\n");
    lines.forEach((text, index) => {
      const skip = allowed.some((a) => a.file === file && a.line === text.trim());
      if (skip) return;
      for (const { name, pattern } of BANNED) {
        if (pattern.test(text)) found.push(`${file}:${String(index + 1)}: ${name}`);
      }
      for (const address of addressesIn(text)) {
        const domain = address.slice(address.indexOf("@") + 1);
        if (!domain.includes(".") || !DOMAIN_END.test(domain)) continue;
        if (RESERVED.test(domain) || address in addresses) continue;
        found.push(`${file}:${String(index + 1)}: an email address (${address})`);
      }
    });
  }
  return found;
}

describe("the real repo", () => {
  it("names nothing of the first project outside the allowed lines", () => {
    expect(findBanned(REPO, ALLOWED)).toEqual([]);
  });

  it("has an allowlist whose every line is still there and still needed", () => {
    // Unallowed, the scan finds exactly the files the allowlist names.
    const hitFiles = findBanned(REPO, []).map((hit) => hit.split(":")[0] ?? "");
    // (Addresses have their own allowlist, checked below.)
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect([...new Set(hitFiles)].toSorted(byName)).toEqual(
      ALLOWED.map((a) => a.file).toSorted(byName),
    );
    for (const { file, line, reason } of ALLOWED) {
      expect(reason.length).toBeGreaterThan(10);
      const lines = readFileSync(path.join(REPO, file), "utf8")
        .split("\n")
        .map((l) => l.trim());
      expect(lines).toContain(line);
    }
  });

  it("has an address allowlist whose every address is still there and still needed", () => {
    const hits = findBanned(REPO, ALLOWED, {});
    const found = new Set(hits.map((hit) => /\(([^()]+)\)$/.exec(hit)?.[1]));
    const byName = (a = "", b = "") => a.localeCompare(b);
    expect([...found].toSorted(byName)).toEqual(Object.keys(ALLOWED_ADDRESSES).toSorted(byName));
    for (const reason of Object.values(ALLOWED_ADDRESSES)) {
      expect(reason.length).toBeGreaterThan(10);
    }
  });
});

describe("the check itself, on a fixture repository", () => {
  let fixture: string;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: fixture, stdio: "pipe" });

  beforeAll(() => {
    fixture = mkdtempSync(path.join(tmpdir(), "clean-fixture-"));
    git("init", "-q");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "t");
    git("config", "commit.gpgsign", "false");
    writeFileSync(path.join(fixture, "ok.md"), "Nothing to see here.\n");
  });

  afterAll(() => {
    rmSync(fixture, { recursive: true, force: true });
  });

  it("passes a clean repository", () => {
    git("add", ".");
    expect(findBanned(fixture, [])).toEqual([]);
  });

  it("fails on each kind of banned text in a tracked file", () => {
    const planted: Record<string, string> = {
      "name.md": NAME + " was here\n",
      "bead.md": "see " + NAME + "-ab12\n",
      "account.md": "account " + ["9941", "1660", "1299"].join("") + "\n",
      "account2.md": "account " + ["6219", "9670", "0591"].join("") + "\n",
      "region.md": ["il", "central", "1"].join("-") + "\n",
      "hebrew.md": `${String.fromCodePoint(0x5e9, 0x5dc)}\n`,
      "shekel.md": `price ${String.fromCodePoint(0x20aa)}10\n`,
    };
    for (const [name, text] of Object.entries(planted))
      writeFileSync(path.join(fixture, name), text);
    git("add", ".");
    const hits = findBanned(fixture, []);
    const missed = Object.keys(planted).filter(
      (name) => !hits.some((h) => h.startsWith(`${name}:`)),
    );
    expect(missed).toEqual([]);
    for (const name of Object.keys(planted)) rmSync(path.join(fixture, name));
    git("add", "-A");
  });

  it("fails on a banned word in a tracked file's name", () => {
    mkdirSync(path.join(fixture, "docs"));
    writeFileSync(path.join(fixture, "docs", NAME + ".md"), "x\n");
    git("add", ".");
    expect(findBanned(fixture, [])).toHaveLength(1);
    rmSync(path.join(fixture, "docs"), { recursive: true });
    git("add", "-A");
  });

  it("skips a binary file, and checks an untracked file that git does not ignore", () => {
    writeFileSync(
      path.join(fixture, "image.bin"),
      Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(NAME)]),
    );
    writeFileSync(path.join(fixture, "untracked.md"), NAME + "\n");
    git("add", "image.bin");
    expect(findBanned(fixture, [])).toEqual(["untracked.md:1: the first project's name"]);
    rmSync(path.join(fixture, "untracked.md"));
    expect(findBanned(fixture, [])).toEqual([]);
  });

  it("fails on an email address outside the reserved domains, and passes the reserved ones", () => {
    const real = ["someone", "mail-provider.com"].join("@");
    writeFileSync(path.join(fixture, "people.md"), `Write to ${real}.\n`);
    writeFileSync(
      path.join(fixture, "examples.md"),
      "a@shop.example b@example.com c@x.test d@y.invalid e@mail.example.org, react@18.3.1 @acme/config\n",
    );
    git("add", ".");
    expect(findBanned(fixture, [], {})).toEqual([`people.md:1: an email address (${real})`]);
    expect(findBanned(fixture, [], { [real]: "a fixture address" })).toEqual([]);
    rmSync(path.join(fixture, "people.md"));
    rmSync(path.join(fixture, "examples.md"));
    git("add", "-A");
  });

  it("lets an allowed line through and still checks the file's other lines", () => {
    const allowed = ["see ", NAME].join("");
    writeFileSync(path.join(fixture, "tests.md"), `  ${allowed}  \n`);
    git("add", "tests.md");
    const entry = { file: "tests.md", line: allowed, reason: "a fixture line that must name it" };
    expect(findBanned(fixture, [entry])).toEqual([]);
    writeFileSync(path.join(fixture, "tests.md"), `${allowed}\n${allowed} again\n`);
    expect(findBanned(fixture, [entry])).toEqual(["tests.md:2: the first project's name"]);
  });
});
