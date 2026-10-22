// Structure rules lint cannot express. Each fails with the list
// of files that break it.
import {
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = path.join(import.meta.dirname, "../..");
const files = (pattern: string) => globSync(pattern, { cwd: root });
const sibling = (file: string) => file.replace(/\.ts$/, ".test.ts");

it("every domain use-case has a sibling test (Tier 2)", () => {
  // Use-cases live one per file in src/domain/<area>/, at any depth. Files
  // directly in src/domain/ are types and ports; src/domain/lib/ is small
  // pure helpers.
  const useCases = files("src/domain/*/**/*.ts").filter(
    (file) => !file.endsWith(".test.ts") && !file.startsWith("src/domain/lib/"),
  );
  expect(useCases.length).toBeGreaterThan(0);
  expect(useCases.filter((file) => !existsSync(path.join(root, sibling(file))))).toEqual([]);
});

// Fakes that are not store ports, and why they need no contract suite.
const FAKES_WITHOUT_SUITES: Record<string, string> = {
  clock: "platform service, tested directly",
  ids: "platform service, tested directly",
  logger: "platform service; the shared toLogLine is tested directly",
  metrics: "platform service; the catalog types are tested directly",
  platform: "assembles the other fakes",
  random: "platform service: counter-based tokens of the real shape",
};

it("every fake of a store is proven against the real thing by a contract suite (Tier 1)", () => {
  const fakes = files("src/fakes/*.ts")
    .filter((file) => !file.endsWith(".test.ts"))
    .map((file) => path.basename(file, ".ts"));
  const missing = fakes
    .filter((name) => !(name in FAKES_WITHOUT_SUITES))
    .flatMap((name) =>
      [`${name}.contract.ts`, `${name}.fake.test.ts`, `${name}.emulator.test.ts`]
        .map((suite) => `tests/contracts/${suite}`)
        .filter((suite) => !existsSync(path.join(root, suite))),
    );
  expect(missing).toEqual([]);
});

// Which contract suite proves each real adapter, and the adapters with none.
// Each suite's emulator test must import every file listed for it.
const ADAPTER_SUITES: Record<string, readonly string[]> = {
  mailer: ["ses/mailer"],
  // Skeleton: the demo's store; bootstrap step 6 makes this entry the first store's.
  "message-store": ["dynamodb/client", "dynamodb/message-store", "dynamodb/table"],
};
const ADAPTERS_WITHOUT_SUITES: Record<string, string> = {
  "clock/system-clock": "one line over Date",
  "dynamodb/cold-start":
    "one GetItem of a key no item has, whose answer is ignored; its sibling test checks the key and that it never throws",
  "ids/uuid-v7": "one line over the uuid package",
  "random/crypto-random": "one line over node:crypto's randomBytes",
  "logger/powertools":
    "formatting is the shared toLogLine, tested directly; the rest is Powertools",
};

it("every real adapter is proven by a contract suite, or says why not (Tier 1)", () => {
  const adapters = files("src/adapters/**/*.ts")
    .filter((file) => !file.endsWith(".test.ts"))
    .map((file) => file.replace(/^src\/adapters\/(.*)\.ts$/, "$1"));
  const covered = [
    ...Object.values(ADAPTER_SUITES).flat(),
    ...Object.keys(ADAPTERS_WITHOUT_SUITES),
  ];
  expect(adapters.filter((adapter) => !covered.includes(adapter))).toEqual([]);
  expect(covered.filter((adapter) => !adapters.includes(adapter))).toEqual([]);

  const unproven = Object.entries(ADAPTER_SUITES).flatMap(([suite, suiteAdapters]) => {
    const test = path.join(root, `tests/contracts/${suite}.emulator.test.ts`);
    const source = existsSync(test) ? readFileSync(test, "utf8") : "";
    return suiteAdapters
      .filter((adapter) => !source.includes(`"../../src/adapters/${adapter}"`))
      .map((adapter) => `${suite} does not exercise ${adapter}`);
  });
  expect(unproven).toEqual([]);
});

// Local first (root CLAUDE.md): a resource's adapter folder comes with a fake,
// a contract suite and a wiring in the dev entry. The fakes of a folder, when
// it does not share its name with the one it stands in for.
const FAKES_OF: Record<string, readonly string[]> = {
  // Skeleton: the demo's store; bootstrap step 6 names the first store's fake.
  dynamodb: ["message-store"],
  ses: ["mailer"],
};

/** What a root's adapter folders lack: no fake, no contract suite, no wiring in entries/dev. */
function localFirstProblems(dir: string): string[] {
  const read = (file: string) =>
    existsSync(path.join(dir, file)) ? readFileSync(path.join(dir, file), "utf8") : "";
  const folders = globSync("src/adapters/*/", { cwd: dir }).map((folder) => path.basename(folder));
  const devEntries = globSync("src/entries/dev/**/*.ts", { cwd: dir })
    .filter((file) => !file.endsWith(".test.ts"))
    .map(read)
    .join("\n");
  const platform = read("src/fakes/platform.ts");
  return folders.flatMap((folder) =>
    (FAKES_OF[folder] ?? [folder]).flatMap((fake) => {
      const problems: string[] = [];
      if (!existsSync(path.join(dir, `src/fakes/${fake}.ts`))) {
        problems.push(`adapters/${folder} has no fake: src/fakes/${fake}.ts`);
      }
      if (
        !(fake in FAKES_WITHOUT_SUITES) &&
        !existsSync(path.join(dir, `tests/contracts/${fake}.contract.ts`))
      ) {
        problems.push(
          `adapters/${folder} has no contract suite: tests/contracts/${fake}.contract.ts`,
        );
      }
      // Wired directly, or through the fake platform the dev entry builds.
      const wired =
        devEntries.includes(`fakes/${fake}"`) ||
        (devEntries.includes('fakes/platform"') && platform.includes(`"./${fake}"`));
      if (!wired)
        problems.push(`adapters/${folder} is not wired in src/entries/dev: fakes/${fake}`);
      return problems;
    }),
  );
}

describe("local first: every adapter folder has a fake, a contract suite and a wiring in entries/dev", () => {
  const made: string[] = [];
  afterEach(() => {
    for (const dir of made.splice(0)) rmSync(dir, { force: true, recursive: true });
  });
  // A small tree with the files given, as the repo lays them out.
  const tree = (files: Record<string, string>) => {
    const dir = mkdtempSync(path.join(tmpdir(), "local-first-"));
    made.push(dir);
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      writeFileSync(path.join(dir, file), text);
    }
    return dir;
  };
  const complete = {
    "src/adapters/queue/real.ts": "",
    "src/fakes/queue.ts": "",
    "tests/contracts/queue.contract.ts": "",
    "src/entries/dev/server.ts": 'import { fakeQueue } from "../../fakes/queue";',
  };

  it("passes a tree whose adapter has all three", () => {
    expect(localFirstProblems(tree(complete))).toEqual([]);
  });

  it("fails an adapters/planted/ folder with no fake, suite or wiring", () => {
    const dir = tree({ ...complete, "src/adapters/planted/real.ts": "" });
    expect(localFirstProblems(dir)).toEqual([
      "adapters/planted has no fake: src/fakes/planted.ts",
      "adapters/planted has no contract suite: tests/contracts/planted.contract.ts",
      "adapters/planted is not wired in src/entries/dev: fakes/planted",
    ]);
  });

  it("fails a folder that has a fake and a suite but no wiring in entries/dev", () => {
    const dir = tree({ ...complete, "src/entries/dev/server.ts": "" });
    expect(localFirstProblems(dir)).toEqual([
      "adapters/queue is not wired in src/entries/dev: fakes/queue",
    ]);
  });

  it("holds for the repo's own adapter folders", () => {
    expect(localFirstProblems(root)).toEqual([]);
  });
});
