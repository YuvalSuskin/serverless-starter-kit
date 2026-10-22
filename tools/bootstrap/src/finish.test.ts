// The steps after the rename, with a scripted runner: what they run, and what
// a failure tells the owner.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";

import { finishSteps, renamedSlug, type RunResult, runSteps } from "./finish.ts";

const SWEEP = "docs/superpowers/specs/2026-09-30-sweep-design.md";
const RESEARCH = "docs/research/2026-09-25-harness-engineering.md";

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
    if (args[0] === "list") {
      const title = args[args.indexOf("--title") + 1];
      return ok(JSON.stringify((opts.listed ?? []).filter((b) => b.title === title)));
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
