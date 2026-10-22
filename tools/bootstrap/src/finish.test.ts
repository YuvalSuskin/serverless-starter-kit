// The steps after the rename, with a scripted runner: what they run, and what
// a failure tells the owner.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";

import { finishSteps, renamedSlug, type RunResult, runSteps } from "./finish.ts";

const SWEEP = "docs/superpowers/specs/2026-09-30-sweep-design.md";
const RESEARCH = "docs/research/2026-09-25-harness-engineering.md";

function write(root: string, files: Record<string, string>): void {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
}

function renamedRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "finish-test-"));
  onTestFinished(() => {
    rmSync(root, { force: true, recursive: true });
  });
  const files: Record<string, string> = {
    ".beads/config.yaml": "# prefix\nissue-prefix: demo\n",
    ".beads/seed-memories.json": JSON.stringify([
      { key: "owner-inbox", text: "Owner preference: ask on <owner-inbox-url>." },
      { key: "explain-before-infra", text: "Explain first; 'sounds good' is not a go-ahead." },
    ]),
    [RESEARCH]: "# Research\n\n**Beads:** `demo-r8n` (inherited research)\n\nBody.\n",
    [SWEEP]: "# Sweep\n\n**Beads:** `demo-tf8` (inherited design)\n\nBody.\n",
  };
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

/** A runner that answers like git, pnpm and bd, failing the first call that starts with `fail`. */
function scripted(opts: {
  fail?: string;
  listed?: { id: string; status: string; title: string }[];
  /** The tracker's prefix after bd init (an adopted tracker keeps its own). */
  prefix?: string;
  /** The repo bd init writes into `.beads/config.yaml` as sync.remote (git's origin). */
  wires?: { root: string; url: string };
}) {
  const calls: string[] = [];
  let next = 0;
  const run = (cmd: string, args: string[]): RunResult => {
    const joined = [cmd, ...args].join(" ");
    calls.push(joined);
    const ok = (stdout = "") => ({ status: 0, stderr: "", stdout });
    if (opts.fail !== undefined && joined.startsWith(opts.fail)) {
      return { status: 1, stderr: "something broke\n", stdout: "" };
    }
    if (cmd === "git") return ok("c0ffee\n");
    if (args[0] === "init" && opts.wires !== undefined) {
      const config = path.join(opts.wires.root, ".beads/config.yaml");
      writeFileSync(
        config,
        `${readFileSync(config, "utf8")}sync:\n    remote: ${opts.wires.url}\n`,
      );
    }
    if (args[0] === "config") {
      return ok(JSON.stringify({ key: "issue_prefix", value: opts.prefix ?? "demo" }));
    }
    if (args[0] === "list") {
      const listed = opts.listed ?? [];
      if (!args.includes("--title")) return ok(JSON.stringify(listed));
      const title = args[args.indexOf("--title") + 1];
      return ok(JSON.stringify(listed.filter((b) => b.title === title)));
    }
    if (args[0] === "create") return ok(JSON.stringify({ id: `demo-n${String(++next)}` }));
    return ok();
  };
  return { calls, run };
}

describe("finishSteps", () => {
  it("installs, inits the tracker, imports the memories, files and closes the anchors", () => {
    const root = renamedRepo();
    const { calls, run } = scripted({});
    const logs: string[] = [];
    expect(runSteps(finishSteps(root, "demo", run), (l) => logs.push(l))).toEqual({
      ok: true,
      report: "",
    });
    expect(calls).toContain("pnpm install");
    expect(calls).toContain(
      "bd init --prefix demo --non-interactive --skip-hooks --skip-agents --init-if-missing --quiet",
    );
    expect(calls).toContain(
      "bd remember --key owner-inbox Owner preference: ask on <owner-inbox-url>.",
    );
    expect(calls.filter((c) => c.startsWith("bd create"))).toHaveLength(2);
    expect(calls).toContain("bd close demo-n1 --reason Inherited document; nothing to do");
    expect(readFileSync(path.join(root, SWEEP), "utf8")).toContain(
      "**Beads:** `demo-n1` (inherited design; this project's anchor for it)\n",
    );
    expect(readFileSync(path.join(root, RESEARCH), "utf8")).toContain(
      "**Beads:** `demo-n2` (inherited research; this project's anchor for it)\n",
    );
    expect(logs).toHaveLength(5);
  });

  it("on a resume, reuses an anchor already filed instead of filing it twice", () => {
    const root = renamedRepo();
    const listed = [
      { id: "demo-old", status: "closed", title: "Consistency sweep (inherited design)" },
    ];
    const { calls, run } = scripted({ listed });
    runSteps(finishSteps(root, "demo", run), () => undefined);
    expect(calls.filter((c) => c.startsWith("bd create"))).toEqual([
      expect.stringContaining("Harness engineering research"),
    ]);
    expect(calls).not.toContain("bd close demo-old --reason Inherited document; nothing to do");
    expect(readFileSync(path.join(root, SWEEP), "utf8")).toContain("**Beads:** `demo-old`");
  });
});

describe("the tracker bd init made", () => {
  // bd init clones a tracker it finds: sync.remote, or refs/dolt/data on git's
  // origin (a mirror or a renamed fork of the template). Whatever the URL, a
  // tracker with another prefix or with issues of its own stops the rename
  // before an anchor is filed.
  it.each([
    ["another prefix", { prefix: "tpl" }, /prefix "tpl"/],
    [
      "issues of its own",
      { listed: [{ id: "demo-zz1", status: "open", title: "Someone else's work" }] },
      /1 issue/,
    ],
  ])("stops, in one line, when it holds %s", (_what, opts, why) => {
    const root = renamedRepo();
    write(root, { ".beads/config.yaml": "issue-prefix: demo\n" });
    const { calls, run } = scripted({
      ...opts,
      wires: { root, url: "/srv/mirror.git" },
    });
    const { ok, report } = runSteps(finishSteps(root, "demo", run), () => undefined);
    expect(ok).toBe(false);
    const [first = ""] = report.split("\n");
    expect(first).toMatch(/^pnpm rename: bd init failed: bd init adopted another tracker/);
    expect(first).toMatch(why);
    expect(first).toContain("/srv/mirror.git");
    expect(calls.some((c) => c.startsWith("bd create"))).toBe(false);
    expect(calls.some((c) => c.startsWith("bd remember"))).toBe(false);
  });

  it("on a resume, accepts the anchors it filed itself", () => {
    const root = renamedRepo();
    const listed = [
      { id: "demo-a1", status: "closed", title: "Consistency sweep (inherited design)" },
      { id: "demo-a2", status: "closed", title: "Harness engineering research (inherited)" },
    ];
    const { ok } = runSteps(finishSteps(root, "demo", scripted({ listed }).run), () => undefined);
    expect(ok).toBe(true);
  });

  it("names the remote bd wired from git's origin, which nothing pushed to", () => {
    const root = renamedRepo();
    const { run } = scripted({ wires: { root, url: "https://github.com/me/shop.git" } });
    const logs: string[] = [];
    expect(runSteps(finishSteps(root, "demo", run), (l) => logs.push(l)).ok).toBe(true);
    expect(logs[1]).toBe(
      "bd init: a fresh tracker, prefix demo. bd set git's origin as its remote (https://github.com/me/shop.git); nothing was pushed. Bootstrap step 3 asks the owner to keep it or remove it.",
    );
  });

  it("drops a tracker remote from the config before bd init, when no database exists yet (a resume)", () => {
    const root = renamedRepo();
    write(root, {
      ".beads/config.yaml": 'issue-prefix: demo\nsync:\n    remote: "file:///tpl"\n',
    });
    const { calls, run } = scripted({});
    const logs: string[] = [];
    runSteps(finishSteps(root, "demo", run), (l) => logs.push(l));
    expect(readFileSync(path.join(root, ".beads/config.yaml"), "utf8")).toBe(
      "issue-prefix: demo\n",
    );
    expect(logs[1]).toContain(
      "removed the tracker remote file:///tpl from .beads/config.yaml first",
    );
    expect(calls).toContain(
      "bd init --prefix demo --non-interactive --skip-hooks --skip-agents --init-if-missing --quiet",
    );
  });

  it("leaves the config's remote alone once a database exists (bd init skips)", () => {
    const root = renamedRepo();
    const config = 'issue-prefix: demo\nsync:\n    remote: "https://github.com/me/shop.git"\n';
    write(root, { ".beads/config.yaml": config });
    mkdirSync(path.join(root, ".beads/embeddeddolt"));
    runSteps(finishSteps(root, "demo", scripted({}).run), () => undefined);
    expect(readFileSync(path.join(root, ".beads/config.yaml"), "utf8")).toBe(config);
  });
});

describe("a failing step", () => {
  it("names every step left, as commands, with the resume and the clean retry", () => {
    const root = renamedRepo();
    const { calls, run } = scripted({ fail: "bd init" });
    const result = runSteps(finishSteps(root, "demo", run), () => undefined);

    expect(result.ok).toBe(false);
    expect(calls.some((c) => c.startsWith("bd remember"))).toBe(false);
    const report = result.report;
    expect(report.split("\n").slice(0, 2)).toEqual([
      "pnpm rename: bd init failed: bd init --prefix demo --non-interactive --skip-hooks --skip-agents --init-if-missing --quiet failed (exit 1):",
      "something broke",
    ]);
    expect(report).not.toContain("Nothing bd-related has run yet");
    expect(report.split("\n").map((l) => l.trim())).not.toContain("pnpm install");
    expect(report).toContain(
      "bd init --prefix demo --non-interactive --skip-hooks --skip-agents --init-if-missing --quiet",
    );
    expect(report).toContain(
      "bd remember --key owner-inbox 'Owner preference: ask on <owner-inbox-url>.'",
    );
    expect(report).toContain(
      String.raw`bd remember --key explain-before-infra 'Explain first; '\''sounds good'\'' is not a go-ahead.'`,
    );
    expect(report).toContain(
      "bd create 'Consistency sweep (inherited design)' --type chore --priority 4 --labels inherited",
    );
    expect(report).toContain("bd create 'Harness engineering research (inherited)'");
    expect(report).toContain(`# then in ${SWEEP}, set the **Beads:** line to:`);
    expect(report).toContain(`# then in ${RESEARCH}, set the **Beads:** line to:`);
    expect(report).toContain("pnpm rename --resume");
    expect(report).toContain("git checkout -- . && git clean -fd && rm -rf .beads/embeddeddolt");
  });

  it("when the install fails, says nothing bd-related has run yet", () => {
    const root = renamedRepo();
    const { calls, run } = scripted({ fail: "pnpm install" });
    const { ok, report } = runSteps(finishSteps(root, "demo", run), () => undefined);
    expect(ok).toBe(false);
    expect(calls).toEqual(["pnpm install"]);
    expect(report).toContain("Nothing bd-related has run yet.");
    expect(report).toContain("  1. pnpm install:\n       pnpm install\n");
  });
});

it("reads the renamed repo's slug from its bead prefix", () => {
  expect(renamedSlug(renamedRepo())).toBe("demo");
});
