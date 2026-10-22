// Lint for Acme's backend. Each block exists for a specific risk.
// tests/rules/lint-rules.test.ts pins every rule here: if it fails after an
// edit, a guarantee was weakened.
import { formatting, hygiene, tests, typescript } from "@acme/config/eslint";
import boundaries from "eslint-plugin-boundaries";
import { defineConfig, globalIgnores } from "eslint/config";

// Every layer is a folder.
const layer = (type, pattern, capture) => ({
  type,
  pattern,
  partialMatch: false,
  ...(capture ? { capture: [capture] } : {}),
});

const allow = (from, to) => ({
  from: { element: { type: from } },
  allow: { to: { element: to } },
});

// Reaching process or console through the global object dodges no-console
// and the process.env rule.
const GLOBAL_ESCAPES = ["globalThis", "global"].flatMap((object) =>
  ["process", "console"].map((property) => ({
    object,
    property,
    message: "Use loadConfig() (platform/config.ts) and deps.log, not the global object.",
  })),
);
const READS_ENV = [
  {
    object: "process",
    property: "env",
    message: "Read configuration through loadConfig() in platform/config.ts.",
  },
];

const ENV_IMPORTS = {
  paths: ["process", "node:process"].map((name) => ({
    name,
    message: "Read configuration through loadConfig() in platform/config.ts.",
  })),
};
const VENDOR_SDKS = {
  patterns: [
    {
      // A leading slash anchors a package name, so ../adapters/x/name is not caught
      // (a native library added later goes here with it).
      group: ["@aws-sdk/*", "@aws-lambda-powertools/*", "@smithy/*"],
      message: "Vendor SDKs live in src/adapters/, behind a port.",
    },
  ],
};
const NONDETERMINISTIC_IMPORTS = {
  paths: ["crypto", "node:crypto", "uuid"].map((name) => ({
    name,
    message: "Take time and ids from deps (Clock, Ids) in domain code.",
  })),
};
const restrictedImports = (...parts) => ({
  paths: parts.flatMap((part) => part.paths ?? []),
  patterns: parts.flatMap((part) => part.patterns ?? []),
});

const VI_MOCK = "CallExpression[callee.object.name='vi'][callee.property.name=/^(mock|doMock)$/]";

export default defineConfig([
  globalIgnores(["dist/**"]),

  ...typescript({ tsconfigRootDir: import.meta.dirname }),

  // Layers, for production code. Tests (*.test.ts, tests/) may import
  // anything, fakes included. Default is disallow: every allowed direction is
  // listed. Specific folders come before the wildcards that would also match.
  {
    files: ["src/**/*.ts"],
    ignores: ["**/*.test.ts"],
    plugins: { boundaries },
    settings: {
      // Without a resolver, "../../fakes/auth" (no extension) resolves to
      // nothing, the plugin sees an "unknown" target, and every rule below
      // passes silently. no-unknown-dependencies turns that into an error.
      "import/resolver": { typescript: { alwaysTryTypes: true, project: "tsconfig.json" } },
      // Workspace packages (@acme/contracts) resolve outside backend/:
      // they are dependencies, like anything in node_modules.
      "boundaries/flag-as-external": { outsideRootPath: true },
      "boundaries/elements": [
        layer("entry-lambda", "src/entries/lambda"),
        layer("entry-dev", "src/entries/dev"),
        layer("api-app", "src/api/app"),
        layer("api-http", "src/api/http"),
        layer("subapp", "src/api/*", "subapp"),
        layer("domain", "src/domain"),
        layer("fakes", "src/fakes"),
        layer("adapter", "src/adapters/*", "port"),
        layer("platform", "src/platform"),
      ],
    },
    rules: {
      "boundaries/no-unknown-dependencies": "error",
      "boundaries/no-unknown-files": "error",
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          message: "{{ from.element.type }} may not import {{ to.element.type }}.",
          policies: [
            // Only the Lambda entry wires remote adapters; only the dev server uses fakes.
            allow("entry-lambda", { type: ["api-app", "adapter", "platform"] }),
            // The dev server runs on fakes, and makes real random tokens: the random
            // adapter is a local library that reaches nothing.
            allow("entry-dev", [
              { type: ["entry-dev", "api-app", "domain", "fakes", "platform"] },
              { type: "adapter", captured: { port: "random" } },
            ]),
            allow("api-app", { type: ["subapp", "api-http", "platform"] }),
            allow("api-http", { type: ["api-http", "domain", "platform"] }),
            // A sub-app never imports another sub-app.
            allow("subapp", [
              { type: "subapp", captured: { subapp: "{{ from.element.captured.subapp }}" } },
              { type: ["api-http", "domain", "platform"] },
            ]),
            allow("domain", { type: ["domain", "platform"] }),
            allow("adapter", [
              { type: "adapter", captured: { port: "{{ from.element.captured.port }}" } },
              { type: ["domain", "platform"] },
            ]),
            allow("fakes", { type: ["fakes", "domain", "platform"] }),
            allow("platform", { type: "platform" }),
          ],
        },
      ],
    },
  },

  // Logs go through the Logger port, with context and redaction.
  { files: ["src/**/*.ts"], rules: { "no-console": "error" } },

  // Only platform/config.ts reads the environment, and nothing
  // reaches process or console around the rules above.
  {
    files: ["src/**/*.ts"],
    rules: { "no-restricted-properties": ["error", ...GLOBAL_ESCAPES, ...READS_ENV] },
  },
  {
    files: ["src/platform/config.ts"],
    rules: { "no-restricted-properties": ["error", ...GLOBAL_ESCAPES] },
  },

  // Imports, per layer. no-restricted-imports is one rule, so a later block
  // replaces an earlier one's list for the files both match: each block
  // carries its full list.
  {
    files: ["src/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: { "no-restricted-imports": ["error", restrictedImports(ENV_IMPORTS, VENDOR_SDKS)] },
  },
  // Adapters are what wrap the vendor SDKs.
  {
    files: ["src/adapters/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: { "no-restricted-imports": ["error", restrictedImports(ENV_IMPORTS)] },
  },

  // Time, ids and randomness come from deps in domain code, so tests are
  // deterministic. The modules are banned too: an aliased import
  // would dodge a call-name selector.
  {
    files: ["src/domain/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        restrictedImports(ENV_IMPORTS, VENDOR_SDKS, NONDETERMINISTIC_IMPORTS),
      ],
      "no-restricted-syntax": [
        "error",
        ...[
          "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          "NewExpression[callee.name='Date'][arguments.length=0]",
          "CallExpression[callee.name='Date']",
          "CallExpression[callee.name='randomUUID']",
          "CallExpression[callee.property.name='randomUUID']",
          "MemberExpression[object.name='performance'][property.name='now']",
          "MemberExpression[object.name='Math'][property.name='random']",
        ].map((selector) => ({
          selector,
          message: "Take time, ids and randomness from deps (Clock, Ids) in domain code.",
        })),
      ],
    },
  },

  ...hygiene,
  ...tests,

  // Replace our code through deps, never by mocking modules.
  // Only an adapter's own tests may mock, and only a third-party module (an
  // SDK the adapter wraps); import() and template forms count as relative.
  {
    files: ["**/*.test.ts", "tests/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: VI_MOCK,
          message:
            "Do not vi.mock: pass a fake through deps. A test that needs this is missing a port.",
        },
      ],
    },
  },
  {
    files: ["src/adapters/**/*.test.ts", "tests/contracts/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...[
          `${VI_MOCK} > Literal.arguments:first-child[value=/^[.]/]`,
          `${VI_MOCK} > TemplateLiteral.arguments:first-child`,
          `${VI_MOCK} > ImportExpression.arguments:first-child`,
        ].map((selector) => ({
          selector,
          message:
            "Do not vi.mock our own modules: pass a fake through deps. An adapter test may mock only the SDK it wraps.",
        })),
      ],
    },
  },

  // These helpers assert; a test that calls one has assertions.
  {
    files: ["**/*.test.ts"],
    rules: {
      "vitest/expect-expect": [
        "error",
        { assertFunctionNames: ["expect", "expectTypeOf", "fires"] },
      ],
    },
  },

  // A contract suite's *.fake.test.ts / *.emulator.test.ts files get their
  // tests from the shared suite function.
  { files: ["tests/contracts/*.test.ts"], rules: { "sonarjs/no-empty-test-file": "off" } },

  // Formatting belongs to Prettier. Keep last.
  formatting,
]);
