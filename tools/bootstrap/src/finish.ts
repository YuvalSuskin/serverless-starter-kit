// What `pnpm rename` does once the files are renamed: the install and the
// tracker steps. Each step is safe to run again, so `pnpm rename --resume`
// runs them all after a failure; the failure itself prints every step left,
// as commands the owner could run by hand (TB100).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface RunResult {
  error?: Error;
  status: number | null;
  stderr: string;
  stdout: string;
}

/** Runs one command in the repo; injectable so the steps can be tested without bd or pnpm. */
export type Runner = (cmd: string, args: string[]) => RunResult;

interface Step {
  /** What the step is, in the report. */
  name: string;
  /** The same step by hand: shell commands, or an edit to make. */
  byHand: string[];
  /** Does it; returns the report line. */
  run: () => string;
  /** The step uses bd. */
  bd: boolean;
}

/** The two inherited docs that name an anchor bead in their `**Beads:**` header (TB91). */
const ANCHORS = [
  {
    description:
      "The consistency sweep's design, docs/superpowers/specs/2026-09-30-sweep-design.md, came with the project template, where it was designed, built and used. Nothing is left to do here: this closed bead is the design's anchor, so its Beads header line names a bead of this project and the sweep lint's header rule holds. Work on the sweep itself is filed as new beads that cite this one.",
    file: "docs/superpowers/specs/2026-09-30-sweep-design.md",
    header: "inherited design; this project's anchor for it",
    title: "Consistency sweep (inherited design)",
  },
  {
    description:
      "The research behind decisions H1-H9, docs/research/2026-09-25-harness-engineering.md, came with the project template. It is history, not a source of rules (the decisions are in docs/decisions/2026-09-25-harness-decisions.md). This closed bead is its anchor, so its Beads header line names a bead of this project and the sweep lint's header rule holds.",
    file: "docs/research/2026-09-25-harness-engineering.md",
    header: "inherited research; this project's anchor for it",
    title: "Harness engineering research (inherited)",
  },
];

const CLOSE_REASON = "Inherited document; nothing to do";

class StepFailed extends Error {}

/** A shell word, quoted only when it needs to be. */
const QUOTE_ESCAPE = String.raw`'\''`;
const sh = (arg: string) =>
  /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", QUOTE_ESCAPE)}'`;
const line = (cmd: string, args: string[]) => [cmd, ...args].map(sh).join(" ");

function call(run: Runner, cmd: string, args: string[]): string {
  const result = run(cmd, args);
  if (result.status !== 0) {
    const output = `${result.stdout}${result.stderr}`.trim().split("\n").slice(-20).join("\n");
    const why = result.error?.message ?? `exit ${String(result.status)}`;
    const tail = output === "" ? "" : `:\n${output}`;
    throw new StepFailed(`${line(cmd, args)} failed (${why})${tail}`);
  }
  return result.stdout;
}

const initArgs = (slug: string) => [
  "init",
  "--prefix",
  slug,
  "--non-interactive",
  "--skip-hooks",
  "--skip-agents",
  "--init-if-missing",
  "--quiet",
];

/**
 * `bd init` commits the beads files it touched. The rename is one change the
 * owner commits whole, so that commit is undone, its changes kept in the tree.
 */
function bdInit(run: Runner, slug: string): void {
  const head = () => call(run, "git", ["rev-parse", "HEAD"]).trim();
  const before = head();
  call(run, "bd", initArgs(slug));
  const after = head();
  if (after === before) return;
  const parent = call(run, "git", ["rev-parse", `${after}~1`]).trim();
  const subject = call(run, "git", ["log", "-1", "--format=%s", after]).trim();
  if (parent === before && subject.startsWith("bd init")) {
    call(run, "git", ["reset", "-q", "--mixed", before]);
  }
}

/** The anchor bead of this title: the one already filed (on a resume), else a new one, closed. */
function anchorBead(run: Runner, anchor: (typeof ANCHORS)[number]): string {
  const found = JSON.parse(
    call(run, "bd", ["list", "--all", "--label", "inherited", "--title", anchor.title, "--json"]),
  ) as { id: string; status: string; title: string }[];
  const existing = found.find((bead) => bead.title === anchor.title);
  const id =
    existing?.id ??
    (
      JSON.parse(
        call(run, "bd", [
          "create",
          anchor.title,
          "--type",
          "chore",
          "--priority",
          "4",
          "--labels",
          "inherited",
          "--description",
          anchor.description,
          "--json",
        ]),
      ) as { id: string }
    ).id;
  if (existing?.status !== "closed") call(run, "bd", ["close", id, "--reason", CLOSE_REASON]);
  return id;
}

const headerLine = (id: string, header: string) => `**Beads:** \`${id}\` (${header})`;

/** Every step after the rename, in order. */
export function finishSteps(root: string, slug: string, run: Runner): Step[] {
  const seedFile = path.join(root, ".beads/seed-memories.json");
  const seed = JSON.parse(readFileSync(seedFile, "utf8")) as { key: string; text: string }[];
  return [
    {
      bd: false,
      byHand: ["pnpm install"],
      name: "pnpm install",
      run: () => {
        call(run, "pnpm", ["install"]);
        return "pnpm install: the lockfile now names the new packages.";
      },
    },
    {
      bd: true,
      byHand: [
        line("bd", initArgs(slug)),
        "# if it made a commit 'bd init: ...': git reset --mixed HEAD~1 (the rename stays one change)",
      ],
      name: "bd init",
      run: () => {
        bdInit(run, slug);
        return `bd init: a fresh tracker, prefix ${slug}.`;
      },
    },
    {
      bd: true,
      byHand: seed.map((m) => line("bd", ["remember", "--key", m.key, m.text])),
      name: "bd remember (the seed memories)",
      run: () => {
        for (const m of seed) call(run, "bd", ["remember", "--key", m.key, m.text]);
        return `bd remember: ${String(seed.length)} seed memories imported.`;
      },
    },
    ...ANCHORS.map((anchor): Step => ({
      bd: true,
      byHand: [
        line("bd", [
          "create",
          anchor.title,
          "--type",
          "chore",
          "--priority",
          "4",
          "--labels",
          "inherited",
          "--description",
          anchor.description,
        ]),
        line("bd", ["close", "<the new id>", "--reason", CLOSE_REASON]),
        `# then in ${anchor.file}, set the **Beads:** line to: ${headerLine("<the new id>", anchor.header)}`,
      ],
      name: `anchor bead "${anchor.title}" and the **Beads:** line of ${anchor.file}`,
      run: () => {
        const id = anchorBead(run, anchor);
        const file = path.join(root, anchor.file);
        const text = readFileSync(file, "utf8");
        writeFileSync(file, text.replace(/^\*\*Beads:\*\* .*$/m, headerLine(id, anchor.header)));
        return `bd anchor, closed: ${id} ${anchor.title} -> ${anchor.file}`;
      },
    })),
  ];
}

/** Runs the steps in order. On a failure, the report says what is left and how to finish. */
export function runSteps(
  steps: Step[],
  log: (text: string) => void,
): { ok: boolean; report: string } {
  for (const [i, step] of steps.entries()) {
    try {
      log(step.run());
    } catch (error) {
      if (!(error instanceof StepFailed)) throw error;
      return {
        ok: false,
        report: failureReport(
          steps.slice(i),
          error.message,
          steps.slice(0, i + 1).some((s) => s.bd),
        ),
      };
    }
  }
  return { ok: true, report: "" };
}

function failureReport(left: Step[], why: string, bdRan: boolean): string {
  const steps = left.flatMap((step, i) => [
    `  ${String(i + 1)}. ${step.name}:`,
    ...step.byHand.map((command) => `       ${command}`),
  ]);
  return [
    `pnpm rename: ${left[0]?.name ?? "a step"} failed: ${why}`,
    "",
    `The files are renamed and the marker is gone, so pnpm rename will not run again. ${bdRan ? "" : "Nothing bd-related has run yet. "}These steps did not run:`,
    ...steps,
    "",
    "To finish, fix the cause, then run: pnpm rename --resume",
    "(it runs every step after the rename again; each is safe to repeat). Or run the commands above by hand.",
    "",
    "To start over from the unrenamed template instead:",
    "  git checkout -- . && git clean -fd && rm -rf .beads/embeddeddolt",
    "(or clone the template again).",
  ].join("\n");
}

/** The slug a renamed repo was given: its bead prefix. */
export function renamedSlug(root: string): string | undefined {
  const config = readFileSync(path.join(root, ".beads/config.yaml"), "utf8");
  return /^issue-prefix:\s*["']?([a-z][a-z0-9-]*)["']?\s*$/m.exec(config)?.[1];
}
