// The rename, on fixture trees and on a `git archive HEAD` copy of this repo.
// Every name here is the placeholder's: this file is on the rename's
// allowlist, so it keeps meaning what it says after a project is renamed.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";

import { leftovers, MARKER, PRIME, PRIME_GUARDED, renameProject, RenameRefused } from "./rename.ts";

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function commitAll(root: string): void {
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "snapshot");
}

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rename-test-"));
  onTestFinished(() => {
    rmSync(dir, { force: true, maxRetries: 3, recursive: true });
  });
  return dir;
}

function initRepo(root: string): void {
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
}

function write(root: string, files: Record<string, Buffer | string>): void {
  for (const [file, content] of Object.entries(files)) {
    const full = path.join(root, file);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

const read = (root: string, file: string) => readFileSync(path.join(root, file), "utf8");

/** A settings file whose SessionStart hook runs `command`. */
const settings = (command: string) =>
  `${JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ command, type: "command" }], matcher: "" }] } }, null, 2)}\n`;

const BINARY = Buffer.from([0, 1, 2, ...Buffer.from("acme"), 0, 255]);

/** The template's own tracker remote, as its published `.beads/config.yaml` names it. */
const TEMPLATE_REMOTE = "git+https://github.com/YuvalSuskin/serverless-starter-kit.git";

/** A small template: every kind of placeholder the real one holds, committed. */
function fixture(): string {
  const root = tempDir();
  initRepo(root);
  write(root, {
    [MARKER]: "Not yet renamed.\n",
    "package.json": `${JSON.stringify(
      {
        dependencies: { "acme-client": "^1.0.0" },
        devDependencies: { "@acme/config": "workspace:*" },
        name: "acme",
        scripts: { push: "ACME_SKIP_CHECKS=1 git push" },
      },
      null,
      2,
    )}\n`,
    "packages/config/package.json": `{\n  "name": "@acme/config"\n}\n`,
    "src/app.ts": [
      'import { client } from "acme-client";',
      'import { x } from "@acme/config";',
      "",
      "// The Acme API, at api.acme.localhost; Acme's own words.",
      "export const skip = process.env.ACME_SKIP_CHECKS;",
      'export const author = "merge-gate@acme.invalid";',
      'export const cache = "~/.cache/acme/competitors/";',
      'export const lock = path.join(common, "acme", "heavy.lock");',
      'export const table = "acme";',
      'export const key = Symbol.for("acme.apiWarmUp");',
      'export const node = "snapshot_beads_acme_x1";',
      'export const ids = ["acme-x1", "acme-5ss.1", `\\nacme-ls4`];',
      'export const header = "# --- BEGIN ACME SYNC ENFORCEMENT ---";',
      "",
    ].join("\n"),
    "packages/config/eslint.mjs": [
      "export const rules = {",
      '  plugins: { acme: { rules: { "zod-namespace-import": zodNamespaceImport } } },',
      '  rules: { "acme/zod-namespace-import": "error" },',
      "};",
      "",
    ].join("\n"),
    ".beads/config.yaml": `# Issue prefix\nissue-prefix: acme\nexport:\n    auto: true\nsync:\n    remote: "${TEMPLATE_REMOTE}"\n`,
    ".beads/metadata.json": `{\n  "database": "dolt",\n  "dolt_database": "acme",\n  "project_id": "5f04d4d2-0000"\n}`,
    "infra/aws/github-deploy.yaml": [
      "  AppInitial:",
      "    Description: >-",
      "      The first letter of the app's name (acme: a). SST names every resource",
      '      be too long ("ac-dev-", "a-dev-"), so every pattern below is this',
      "",
    ].join("\n"),
    "infra/aws/README.md":
      "  --parameter-overrides Stage=dev AppInitial=a CreateAccountResources=true\n",
    "docs/acme-notes/acme.md": "# Acme notes\n",
    ".claude/settings.json": settings(PRIME_GUARDED),
    "design/fonts/logo.bin": BINARY,
    "pnpm-lock.yaml": "importers:\n  .:\n    devDependencies:\n      '@acme/config':\n",
  });
  commitAll(root);
  write(root, { "scratch.txt": "acme, untracked\n" });
  return root;
}

function untouched(root: string): void {
  expect(git(root, "status", "--porcelain", "--untracked-files=no")).toBe("");
  expect(existsSync(path.join(root, MARKER))).toBe(true);
}

describe("renameProject refuses", () => {
  it.each([
    ["a space", "My App"],
    ["a scope", "@x/y"],
    ["nothing", ""],
    ["the placeholder", "acme"],
    ["51 characters", `a${"b".repeat(50)}`],
    ["a leading digit", "1app"],
    ["capitals", "MyApp"],
    ["a trailing hyphen", "shop-"],
  ])("a slug with %s, before changing a file", async (_why, slug) => {
    const root = fixture();
    await expect(renameProject(root, { display: "Demo", slug })).rejects.toThrow(RenameRefused);
    untouched(root);
  });

  it.each([
    ["nothing", ""],
    ["a quote", 'Demo "Mail"'],
    ["an apostrophe", "Demo's"],
    ["a dollar sign", "Demo $"],
    ["a line break", "Demo\nBcc"],
  ])("a display name with %s", async (_why, display) => {
    const root = fixture();
    await expect(renameProject(root, { display, slug: "demo" })).rejects.toThrow(RenameRefused);
    untouched(root);
  });

  it.each([
    ["slug", { display: "Shop", slug: "acme-shop" }],
    ["slug", { display: "Shop", slug: "myacme" }],
    ["display name", { display: "Super Acme", slug: "shop" }],
    ["display name", { display: "ACMEcorp", slug: "shop" }],
  ])("a %s holding the placeholder, in one line", async (_what, name) => {
    const root = fixture();
    const refusal = renameProject(root, name);
    await expect(refusal).rejects.toThrow(RenameRefused);
    await expect(refusal).rejects.toThrow(/^[^\n]*holds the placeholder[^\n]*$/);
    untouched(root);
  });

  it("a dirty tree", async () => {
    const root = fixture();
    write(root, { "src/app.ts": "// changed\n" });
    await expect(renameProject(root, { display: "Demo", slug: "demo" })).rejects.toThrow(
      /dirty|uncommitted/i,
    );
    expect(read(root, "package.json")).toContain('"name": "acme"');
  });

  it("a copy with no commit, as `git clone … && rm -rf .git && git init` leaves, changing nothing", async () => {
    const root = fixture();
    rmSync(path.join(root, ".git"), { force: true, recursive: true });
    initRepo(root);
    const refusal = renameProject(root, { display: "Demo", slug: "demo" });
    await expect(refusal).rejects.toThrow(RenameRefused);
    await expect(refusal).rejects.toThrow(/^[^\n]*commit[^\n]*$/);
    expect(read(root, "package.json")).toContain('"name": "acme"');
    expect(existsSync(path.join(root, MARKER))).toBe(true);
  });

  it("a marker that is not tracked, in one line", async () => {
    const root = fixture();
    git(root, "rm", "-q", "--cached", MARKER);
    git(root, "commit", "-q", "-m", "untrack the marker");
    const refusal = renameProject(root, { display: "Demo", slug: "demo" });
    await expect(refusal).rejects.toThrow(RenameRefused);
    await expect(refusal).rejects.toThrow(/^[^\n]*not committed[^\n]*$/);
    expect(read(root, "package.json")).toContain('"name": "acme"');
    expect(existsSync(path.join(root, MARKER))).toBe(true);
  });

  it("without the marker, so a second run refuses", async () => {
    const root = fixture();
    await renameProject(root, { display: "Demo", slug: "demo" });
    commitAll(root);
    await expect(renameProject(root, { display: "Shop", slug: "shop" })).rejects.toThrow(
      new RegExp(MARKER.replaceAll(".", String.raw`\.`)),
    );
    expect(read(root, "package.json")).toContain('"name": "demo"');
  });

  it.each([
    ["https", "https://github.com/YuvalSuskin/serverless-starter-kit.git"],
    ["ssh, through a host alias", "github-work:YuvalSuskin/Serverless-Starter-Kit"],
    ["the tracker remote's own", TEMPLATE_REMOTE],
  ])("a clone whose origin is the template's repository (%s), in one line", async (_form, url) => {
    const root = fixture();
    git(root, "remote", "add", "origin", url);
    const refusal = renameProject(root, { display: "Demo", slug: "demo" });
    await expect(refusal).rejects.toThrow(RenameRefused);
    await expect(refusal).rejects.toThrow(/^[^\n]*origin is the template's repository[^\n]*$/);
    untouched(root);
  });

  it("when the template's repository would be named outside the allowlist", async () => {
    const root = fixture();
    write(root, { "docs/links.md": "See github.com/YuvalSuskin/serverless-starter-kit.\n" });
    commitAll(root);
    await expect(renameProject(root, { display: "Demo", slug: "demo" })).rejects.toThrow(
      /docs\/links\.md:1/,
    );
    untouched(root);
  });

  it("when a placeholder would be left outside the allowlist, before changing a file", async () => {
    const root = fixture();
    write(root, { "src/glued.ts": 'export const odd = "acmeish";\n' });
    commitAll(root);
    await expect(renameProject(root, { display: "Demo", slug: "demo" })).rejects.toThrow(
      /src\/glued\.ts:1/,
    );
    untouched(root);
  });
});

describe("renameProject, to demo", () => {
  it("rewrites every placeholder, renames paths and deletes the marker", async () => {
    const root = fixture();
    const report = await renameProject(root, { display: "Demo", slug: "demo" });

    expect(existsSync(path.join(root, MARKER))).toBe(false);
    expect(JSON.parse(read(root, "package.json"))).toMatchObject({
      dependencies: { "acme-client": "^1.0.0" },
      devDependencies: { "@demo/config": "workspace:*" },
      name: "demo",
      scripts: { push: "DEMO_SKIP_CHECKS=1 git push" },
    });
    expect(read(root, "src/app.ts")).toBe(
      [
        'import { client } from "acme-client";',
        'import { x } from "@demo/config";',
        "",
        "// The Demo API, at api.demo.localhost; Demo's own words.",
        "export const skip = process.env.DEMO_SKIP_CHECKS;",
        'export const author = "merge-gate@demo.invalid";',
        'export const cache = "~/.cache/demo/competitors/";',
        'export const lock = path.join(common, "demo", "heavy.lock");',
        'export const table = "demo";',
        'export const key = Symbol.for("demo.apiWarmUp");',
        'export const node = "snapshot_beads_demo_x1";',
        'export const ids = ["demo-x1", "demo-5ss.1", `\\ndemo-ls4`];',
        'export const header = "# --- BEGIN DEMO SYNC ENFORCEMENT ---";',
        "",
      ].join("\n"),
    );
    expect(read(root, "packages/config/eslint.mjs")).toContain("plugins: { demo: { rules: {");
    expect(read(root, "packages/config/eslint.mjs")).toContain('"demo/zod-namespace-import"');
    // The template's tracker remote goes: bd init would adopt the template's issues.
    expect(read(root, ".beads/config.yaml")).toBe(
      "# Issue prefix\nissue-prefix: demo\nexport:\n    auto: true\n",
    );
    expect(report.trackerRemote).toBe(TEMPLATE_REMOTE);
    // bd init writes a fresh project_id: the template's tracker is not the project's.
    expect(JSON.parse(read(root, ".beads/metadata.json"))).toEqual({
      database: "dolt",
      dolt_database: "demo",
    });
    expect(read(root, "infra/aws/github-deploy.yaml")).toContain("(demo: d)");
    expect(read(root, "infra/aws/github-deploy.yaml")).toContain('("de-dev-", "d-dev-")');
    expect(read(root, "infra/aws/README.md")).toContain("AppInitial=d ");
    expect(read(root, "docs/demo-notes/demo.md")).toBe("# Demo notes\n");
    // The marker is gone, so the SessionStart hook primes every session.
    expect(read(root, ".claude/settings.json")).toBe(settings(PRIME));
    expect(existsSync(path.join(root, "docs/acme-notes"))).toBe(false);
    // Never a binary, an untracked file or the lockfile (pnpm install rewrites it).
    expect(readFileSync(path.join(root, "design/fonts/logo.bin"))).toEqual(BINARY);
    expect(read(root, "scratch.txt")).toBe("acme, untracked\n");
    expect(read(root, "pnpm-lock.yaml")).toContain("'@acme/config'");

    expect(report.renamedPaths).toEqual([
      { from: "docs/acme-notes/acme.md", to: "docs/demo-notes/demo.md" },
    ]);
    expect(report.thirdParty).toEqual(["acme-client"]);
    expect(report.replacements.scope).toBe(3);
    expect(report.replacements.envVar).toBe(2);
    expect(report.filesChanged).toBe(10);
  });

  it.each([
    [
      "a flat sync.remote key",
      "issue-prefix: acme\nsync.remote: 'file:///tpl' # the template's\n",
      "issue-prefix: demo\n",
    ],
    [
      "a sync block holding more than the remote, which stays",
      "sync:\n  # where issues go\n  remote: file:///tpl\n  branch: main\nissue-prefix: acme\n",
      "sync:\n  # where issues go\n  branch: main\nissue-prefix: demo\n",
    ],
    ["no remote at all", "issue-prefix: acme\nsync:\n  branch: main\n", undefined],
  ])("drops the tracker remote from %s", async (_shape, config, after) => {
    const root = fixture();
    write(root, { ".beads/config.yaml": config });
    git(root, "add", ".beads/config.yaml");
    git(root, "commit", "-q", "-m", "config");
    const report = await renameProject(root, { display: "Demo", slug: "demo" });
    const expected = after ?? config.replace("acme", "demo");
    expect(read(root, ".beads/config.yaml")).toBe(expected);
    expect(report.trackerRemote).toBe(after === undefined ? undefined : "file:///tpl");
  });

  it("leaves no placeholder outside the allowlist, and every package name valid", async () => {
    const root = fixture();
    await renameProject(root, { display: "Demo", slug: "demo" });
    expect(leftovers(root, { installed: false })).toEqual([]);
    for (const file of git(root, "ls-files", "*package.json").trim().split("\n")) {
      expect(read(root, file)).toSatisfy((text: string) =>
        validNpmName((JSON.parse(text) as { name?: unknown }).name),
      );
    }
  });
});

describe("leftovers", () => {
  it("names a tracker remote left in .beads/config.yaml, whatever its URL", async () => {
    const root = fixture();
    await renameProject(root, { display: "Demo", slug: "demo" });
    write(root, {
      ".beads/config.yaml": `${read(root, ".beads/config.yaml")}sync:\n    remote: "file:///elsewhere"\n`,
    });
    expect(leftovers(root, { installed: false })).toEqual([
      {
        file: ".beads/config.yaml",
        line: 6,
        text: 'remote: "file:///elsewhere"',
      },
    ]);
  });

  it("names the template's repository in a tracked file", async () => {
    const root = fixture();
    await renameProject(root, { display: "Demo", slug: "demo" });
    write(root, { "docs/links.md": "Forked from Serverless-Starter-Kit.\n" });
    git(root, "add", "docs/links.md");
    expect(leftovers(root, { installed: false })).toEqual([
      { file: "docs/links.md", line: 1, text: "Forked from Serverless-Starter-Kit." },
    ]);
  });
});

describe("renameProject, to a one-letter slug", () => {
  it("names the shortened app once", async () => {
    const root = fixture();
    await renameProject(root, { display: "X", slug: "x" });
    expect(read(root, "infra/aws/github-deploy.yaml")).toContain('be too long ("x-dev-"), so');
    expect(read(root, "infra/aws/github-deploy.yaml")).toContain("(x: x)");
  });
});

describe("renameProject, to a hyphenated slug", () => {
  it("underscores it where a hyphen cannot go", async () => {
    const root = fixture();
    await renameProject(root, { display: "My Shop", slug: "my-shop" });
    const app = read(root, "src/app.ts");
    expect(app).toContain("process.env.MY_SHOP_SKIP_CHECKS");
    expect(app).toContain('"snapshot_beads_my_shop_x1"');
    expect(app).toContain('"my-shop-x1"');
    expect(app).toContain("// The My Shop API, at api.my-shop.localhost; My Shop's own words.");
    expect(read(root, ".beads/config.yaml")).toContain("issue-prefix: my-shop\n");
    expect(read(root, "infra/aws/github-deploy.yaml")).toContain('("my-dev-", "m-dev-")');
    // bd's embedded Dolt refuses a hyphen in a database name.
    expect(JSON.parse(read(root, ".beads/metadata.json"))).toMatchObject({
      dolt_database: "my_shop",
    });
    expect(read(root, "packages/config/eslint.mjs")).toContain('plugins: { "my-shop": { rules: {');
    expect(JSON.parse(read(root, "package.json"))).toMatchObject({
      name: "my-shop",
      scripts: { push: "MY_SHOP_SKIP_CHECKS=1 git push" },
    });
    expect(leftovers(root, { installed: false })).toEqual([]);
  });
});

// The real template, as a new project gets it. A renamed project has no
// marker, so there the test has nothing to rename and skips.
const repoRoot = path.resolve(import.meta.dirname, "../../..");
describe.skipIf(!existsSync(path.join(repoRoot, MARKER)))(
  "renameProject on this repo's HEAD",
  () => {
    it("leaves no placeholder outside the allowlist, and every package name valid", async () => {
      const copy = tempDir();
      const tar = path.join(copy, ".head.tar");
      git(repoRoot, "archive", "--format=tar", "-o", tar, "HEAD");
      execFileSync("tar", ["-xf", tar, "-C", copy]);
      rmSync(tar);
      initRepo(copy);
      commitAll(copy);

      const report = await renameProject(copy, { display: "Demo", slug: "demo" });

      expect(report.filesChanged).toBeGreaterThan(100);
      expect(read(copy, ".claude/settings.json")).toContain(JSON.stringify(PRIME));
      expect(read(copy, ".claude/settings.json")).not.toContain("test -e");
      // The template ships the bootstrap's state, every step pending; the rename keeps it.
      expect(JSON.parse(read(copy, ".bootstrap/state.json"))).toEqual({ steps: {} });
      expect(git(copy, "ls-files", ".bootstrap/state.json").trim()).toBe(".bootstrap/state.json");
      expect(leftovers(copy, { installed: false })).toEqual([]);
      const manifests = git(copy, "ls-files", "package.json", "*/package.json").trim().split("\n");
      expect(manifests.length).toBeGreaterThan(5);
      for (const file of manifests) {
        const { name } = JSON.parse(read(copy, file)) as { name?: unknown };
        expect(validNpmName(name), `${file}: ${String(name)}`).toBe(true);
        expect(String(name)).toMatch(/^(@demo\/[a-z-]+|demo)$/);
      }
    });
  },
);

// Claude Code's SessionStart hook, run as Claude Code runs it: by a shell, in
// the project, with CLAUDE_PROJECT_DIR set. A stand-in bd records each call.
describe.skipIf(!existsSync(path.join(repoRoot, MARKER)))("the SessionStart hook", () => {
  const hookCommand = () => {
    const parsed = JSON.parse(read(repoRoot, ".claude/settings.json")) as {
      hooks: { SessionStart: { hooks: { command: string }[] }[] };
    };
    return parsed.hooks.SessionStart.flatMap((entry) => entry.hooks.map((h) => h.command));
  };
  const runHook = (project: string, command: string): string[] => {
    const bin = tempDir();
    const log = path.join(bin, "calls");
    writeFileSync(path.join(bin, "bd"), `#!/bin/sh\necho "bd $*" >> "${log}"\n`, { mode: 0o755 });
    execFileSync("sh", ["-c", command], {
      cwd: project,
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: project,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
      },
    });
    return existsSync(log) ? read(bin, "calls").trim().split("\n") : [];
  };

  it("is the guarded bd prime in the template", () => {
    expect(hookCommand()).toEqual([PRIME_GUARDED]);
  });

  const PRIMED = [`bd ${PRIME.slice(3)}`];

  it("skips bd prime in a fresh copy: the marker, and no tracker database yet", () => {
    const project = tempDir();
    writeFileSync(path.join(project, MARKER), "Not yet renamed.\n");
    mkdirSync(path.join(project, ".beads"));
    expect(runHook(project, PRIME_GUARDED)).toEqual([]);
  });

  // The template's own checkout keeps the marker for good, and has a live
  // tracker: its sessions must still be primed.
  it.each(["embeddeddolt", "dolt"])(
    "runs bd prime where the marker sits beside a tracker database (.beads/%s)",
    (dir) => {
      const project = tempDir();
      writeFileSync(path.join(project, MARKER), "Not yet renamed.\n");
      mkdirSync(path.join(project, ".beads", dir), { recursive: true });
      expect(runHook(project, PRIME_GUARDED)).toEqual(PRIMED);
    },
  );

  it("runs bd prime once the marker is gone", () => {
    expect(runHook(tempDir(), PRIME_GUARDED)).toEqual(PRIMED);
  });
});

/** npm's rules for a new package name: lowercase, URL-safe, at most 214 characters. */
function validNpmName(name: unknown): boolean {
  return (
    typeof name === "string" &&
    name.length <= 214 &&
    /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name)
  );
}
