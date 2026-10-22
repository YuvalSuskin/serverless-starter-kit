// One probe per lint rule: it proves the rule still fires. A plugin upgrade
// or a config edit can disable a rule silently -- it happened once: without
// an import resolver, every layer rule passed. This does not restate the
// rules; eslint.config.mjs is their one source. Change a rule on purpose and
// update its probe with it (backend/CLAUDE.md, "When a rule is in the way").
import { ESLint } from "eslint";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let eslint: ESLint;

beforeAll(async () => {
  eslint = new ESLint({
    cwd: path.join(import.meta.dirname, "../.."),
    overrideConfig: {
      files: ["**/*.ts"],
      languageOptions: {
        parserOptions: {
          // Probe files exist only in memory. typescript-eslint's project
          // service rejects paths it cannot find on disk, so these are served
          // from a default project built from the real tsconfig.json.
          projectService: {
            allowDefaultProject: [
              "src/*/probe.ts",
              "src/*/*/probe.ts",
              "src/*/*/probe.test.ts",
              "tests/*/probe.test.ts",
            ],
            defaultProject: "tsconfig.json",
            // The default cap is 8 in-memory files.
            maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 20,
          },
        },
      },
    },
  });
  // The first lint builds the TypeScript program. Pay for it here.
  await eslint.lintText("export {};\n", { filePath: "src/platform/probe.ts" });
}, 60_000);

async function rulesFiredFor(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((message) => message.ruleId ?? "(parse error)");
}

const importing = (from: string, name: string) =>
  `import { ${name} } from "${from}";\n\nexport const probe = ${name};\n`;

const fires = async (file: string, code: string, rule: string) => {
  expect(await rulesFiredFor(file, code)).toContain(rule);
};

describe("layers: the machinery works", () => {
  it("refuses an import against the layer table", async () => {
    await fires(
      "src/domain/probe.ts",
      importing("../fakes/clock", "fakeClock"),
      "boundaries/dependencies",
    );
  });

  // Also proves the import resolved: an unresolved one fires
  // no-unknown-dependencies instead. Skeleton: the demo's use case is the
  // import; bootstrap step 6 names one of the first feature's.
  it("allows what the table allows, and treats a nested folder as its layer", async () => {
    expect(
      await rulesFiredFor(
        "src/api/public/probe.ts",
        importing("../../domain/messages/list-messages", "listMessages"),
      ),
    ).toEqual([]);
    expect(
      await rulesFiredFor(
        "src/domain/messages/probe.ts",
        importing("../../fakes/clock", "fakeClock"),
      ),
    ).toContain("boundaries/dependencies");
  });

  it("keeps a sub-app out of the others and out of the app's wiring", async () => {
    await fires(
      "src/api/public/probe.ts",
      importing("../app/create-app", "createApp"),
      "boundaries/dependencies",
    );
  });

  it("rejects a file outside every layer", async () => {
    await fires("src/misc/probe.ts", "export const probe = 1;\n", "boundaries/no-unknown-files");
  });

  it("rejects production code importing from tests/", async () => {
    await fires(
      "src/domain/probe.ts",
      importing("../../tests/support/test-app", "testApp"),
      "boundaries/no-unknown-dependencies",
    );
  });
});

// An invariant (backend/CLAUDE.md): nothing deployed trusts an unverified
// identity claim, so no fake reaches production code.
describe("fakes stay out of production code", () => {
  it.each(["src/entries/lambda/probe.ts", "src/api/http/probe.ts"])(
    "%s may not import a fake",
    async (file) => {
      await fires(file, importing("../../fakes/clock", "fakeClock"), "boundaries/dependencies");
    },
  );

  // The dev server runs on fakes and the local random adapter, and no other
  // real adapter.
  it("the dev server may use the random adapter, and no other real adapter", async () => {
    expect(
      await rulesFiredFor(
        "src/entries/dev/probe.ts",
        importing("../../adapters/random/crypto-random", "cryptoRandom"),
      ),
    ).not.toContain("boundaries/dependencies");
    await fires(
      "src/entries/dev/probe.ts",
      importing("../../adapters/dynamodb/client", "documentClient"),
      "boundaries/dependencies",
    );
  });

  it("the dev server and tests may", async () => {
    for (const file of ["src/entries/dev/probe.ts", "src/domain/messages/probe.test.ts"]) {
      expect(await rulesFiredFor(file, importing("../../fakes/clock", "fakeClock"))).not.toContain(
        "boundaries/dependencies",
      );
    }
  });
});

describe("one probe per rule", () => {
  it("process.env outside platform/config.ts", async () => {
    await fires(
      "src/platform/probe.ts",
      "export const probe = process.env.STAGE;\n",
      "no-restricted-properties",
    );
    expect(
      await rulesFiredFor("src/platform/config.ts", "export const probe = process.env.STAGE;\n"),
    ).toEqual([]);
  });

  it("node:process", async () => {
    await fires(
      "src/api/http/probe.ts",
      'import { env } from "node:process";\n\nexport const probe = env.STAGE;\n',
      "no-restricted-imports",
    );
  });

  it("globalThis.console", async () => {
    await fires(
      "src/api/http/probe.ts",
      'export const probe = () => { globalThis.console.log("x"); };\n',
      "no-restricted-properties",
    );
  });

  it("console", async () => {
    await fires(
      "src/platform/probe.ts",
      'export const probe = () => { console.log("x"); };\n',
      "no-console",
    );
  });

  it('`import { z } from "zod"`', async () => {
    await fires("src/platform/probe.ts", importing("zod", "z"), "acme/zod-namespace-import");
  });

  it("time and randomness in domain code", async () => {
    await fires(
      "src/domain/probe.ts",
      "export const probe = () => Date.now();\n",
      "no-restricted-syntax",
    );
    await fires(
      "src/domain/probe.ts",
      'import { randomUUID as uuid } from "node:crypto";\n\nexport const probe = () => uuid();\n',
      "no-restricted-imports",
    );
  });

  it("vendor SDKs outside adapters", async () => {
    await fires(
      "src/domain/probe.ts",
      importing("@aws-sdk/client-dynamodb", "DynamoDBClient"),
      "no-restricted-imports",
    );
    expect(
      await rulesFiredFor(
        "src/adapters/dynamodb/probe.ts",
        importing("@aws-sdk/client-dynamodb", "DynamoDBClient"),
      ),
    ).toEqual([]);
  });

  const mocking = (call: string) =>
    `import { it, vi } from "vitest";\n\n${call};\n\nit("x", () => {});\n`;

  it("vi.mock outside an adapter's own tests", async () => {
    await fires(
      "src/domain/messages/probe.test.ts",
      mocking('vi.mock("@aws-sdk/client-dynamodb")'),
      "no-restricted-syntax",
    );
  });

  it("vi.mock of our own modules in an adapter test, but not of the SDK", async () => {
    await fires(
      "tests/contracts/probe.test.ts",
      mocking('vi.mock("../../src/platform/usage")'),
      "no-restricted-syntax",
    );
    expect(
      await rulesFiredFor(
        "tests/contracts/probe.test.ts",
        mocking('vi.mock("@aws-sdk/client-dynamodb")'),
      ),
    ).not.toContain("no-restricted-syntax");
  });
});
