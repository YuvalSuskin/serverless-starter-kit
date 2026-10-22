// Lint for Acme's frontend. Each block exists for a specific risk.
import { formatting, hygiene, parser, tests, typescript } from "@acme/config/eslint";
import nextVitals from "eslint-config-next/core-web-vitals";
import betterTailwind from "eslint-plugin-better-tailwindcss";
import boundaries from "eslint-plugin-boundaries";
import jsxA11y from "eslint-plugin-jsx-a11y";
import storybook from "eslint-plugin-storybook";
import testingLibrary from "eslint-plugin-testing-library";
import { defineConfig, globalIgnores } from "eslint/config";

// A Tailwind arbitrary value or arbitrary property in the utility part of a
// class (after its last variant): text-[13px], md:ring-[3px], bg-(--x),
// [mask-type:luminance] -- also with a modifier or an important flag
// (text-[13px]/7, !text-[13px], bg-[#fff]/50), and an arbitrary modifier on a
// token class (bg-grey-900/[0.3], text-100/[20px]). Plain opacity (bg-grey-900/50) and
// arbitrary VARIANTS such as has-[>svg]: or data-[state=open]: are allowed.
const ARBITRARY_VALUE = String.raw`(^|:)!?(?:(-?[a-z0-9-]+-)?(\[[^\]]*\]|\([^)]*\))(/(\[[^\]]*\]|\([^)]*\)|[\w.]+))?|-?[a-z0-9-]+/(\[[^\]]*\]|\([^)]*\)))!?$`;

// Hebrew is horizontal-tb, so only the INLINE axis flips under RTL. The
// logical-properties rule also rewrites block-axis and sizing classes
// (h-10 -> block-10, w-4 -> inline-4), which change nothing for us: exempt them.
const DIRECTION_AGNOSTIC = [
  String.raw`(^|:)-?(p|m|scroll-p|scroll-m)[tby]-`,
  String.raw`(^|:)-?(top|bottom)-`,
  String.raw`(^|:)(min-|max-)?[hw]-`,
  String.raw`(^|:)size-`,
];

// Physical-direction classes the logical-properties rule has no mapping for.
const PHYSICAL_BORDERS_AND_CORNERS = String.raw`(^|:)(border-[lr]|rounded-([lr]|tl|tr|bl|br))(-|$)`;

export default defineConfig([
  globalIgnores([
    ".next/**",
    ".open-next/**",
    "storybook-static/**",
    "coverage/**",
    "test-results/**",
    "playwright-report/**",
    "next-env.d.ts",
  ]),

  // React, hooks (v7, including the React Compiler rules), Next, basic a11y.
  ...nextVitals,

  // eslint-config-next parses plain JS with Next's bundled Babel parser, whose
  // scope manager predates ESLint 10 ("scopeManager.addGlobals is not a
  // function"). typescript-eslint's parser handles JS and is ESLint 10-ready.
  { files: ["**/*.{js,mjs,cjs}"], languageOptions: { parser } },

  // Type-aware correctness (shared base, @acme/config).
  ...typescript({ tsconfigRootDir: import.meta.dirname }),

  // a11y: raise Next's handful of jsx-a11y rules to the strict preset. The
  // plugin is already registered by eslint-config-next, so take rules only.
  { files: ["**/*.tsx"], rules: jsxA11y.flatConfigs.strict.rules },

  // Architecture: app/(pillar) -> features -> ui -> lib.
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        {
          type: "pillar",
          pattern: String.raw`src/app/\(*\)`,
          capture: ["pillar"],
          partialMatch: false,
        },
        { type: "app", pattern: "src/app", partialMatch: false },
        { type: "feature", pattern: "src/features/*", capture: ["feature"], partialMatch: false },
        { type: "ui", pattern: "src/ui", partialMatch: false },
        { type: "data", pattern: "src/lib/data", partialMatch: false },
        { type: "lib", pattern: "src/lib", partialMatch: false },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          policies: [
            {
              from: { element: { type: "lib" } },
              disallow: { to: { element: { type: ["data", "ui", "feature", "app", "pillar"] } } },
              message: "lib/ is the bottom layer: it may import only lib/.",
            },
            {
              from: { element: { type: "data" } },
              disallow: { to: { element: { type: ["ui", "feature", "app", "pillar"] } } },
              message: "lib/data/ holds data hooks: it may import only lib/.",
            },
            {
              from: { element: { type: "ui" } },
              disallow: { to: { element: { type: ["data", "feature", "app", "pillar"] } } },
              message: "ui/ is the design system: no data fetching, no features, no routes.",
            },
            {
              from: { element: { type: "feature" } },
              disallow: { to: { element: { type: ["app", "pillar"] } } },
              message: "features/ must not import route code.",
            },
            {
              from: { element: { type: "feature" } },
              disallow: {
                to: {
                  element: {
                    type: "feature",
                    captured: { feature: "!{{ from.element.captured.feature }}" },
                    fileInternalPath: "!index.{ts,tsx}",
                  },
                },
              },
              message: "Import another feature only through its index.ts.",
            },
            {
              from: { element: { type: "pillar" } },
              disallow: {
                to: {
                  element: {
                    type: "pillar",
                    captured: { pillar: "!{{ from.element.captured.pillar }}" },
                  },
                },
              },
              message: "A pillar must not import another pillar's code.",
            },
          ],
        },
      ],
    },
  },

  // Server state goes through our domain hooks in src/lib/data/, which return
  // our own shapes; SWR is an implementation detail of that layer (D1).
  {
    files: ["**/*.{ts,tsx,mts}"],
    ignores: ["src/lib/data/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "swr", message: "Use a domain hook from @/lib/data instead." },
            {
              name: "@acme/contracts/client",
              message: "Call the API through a hook or function in @/lib/data.",
            },
          ],
          patterns: [
            { group: ["swr/*"], message: "Use a domain hook from @/lib/data instead." },
            {
              group: [
                "@/lib/data/api-client",
                // One entry point per audience: public-call, and any later member-call.
                "@/lib/data/*-call",
                "@acme/contracts/client/*",
              ],
              message: "Call the API through a hook or function in @/lib/data.",
            },
          ],
        },
      ],
    },
  },

  // The offline step (root CLAUDE.md, "Local first") blocks the browser through
  // the `test` of e2e/test.ts, so a spec takes `test` and `expect` from there.
  // Helpers (laptop.ts, phones.ts) may use Playwright's types and `devices`.
  {
    files: ["e2e/**/*.{spec,test}.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@playwright/test",
              message:
                "Import test and expect from ./test: it blocks the network in the offline run.",
            },
          ],
        },
      ],
    },
  },

  // The contracts' main entry carries zod: in page code it may be imported for
  // TYPES only, or zod lands in the browser bundle (measured: a page's client
  // JS went from 23 KB to 141 KB). Runtime values come from
  // @acme/contracts/client. Tests and MSW mocks may use the schemas.
  // The touch-gesture helpers are test code: they dispatch synthetic events.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.stories.tsx", "src/lib/data/mock-route.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              allowTypeImports: true,
              message:
                "Import types only from @acme/contracts; values come from @acme/contracts/client.",
              name: "@acme/contracts",
            },
          ],
          patterns: [
            {
              group: ["@/lib/gestures", "**/lib/gestures", "./gestures"],
              message: "The touch-gesture helpers are for tests and stories only.",
            },
            {
              group: ["@/lib/geometry", "**/lib/geometry", "./geometry"],
              message: "The geometry test helper is for tests and stories only.",
            },
          ],
        },
      ],
    },
  },

  // Language and direction come from src/lib/locale.ts, and every Intl
  // formatter and toLocale* call is given its LOCALE (decision D6).
  {
    files: ["src/**/*.{ts,tsx}", ".storybook/*.{ts,tsx}"],
    ignores: ["src/lib/locale.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...[
          "JSXAttribute[name.name=/^(lang|dir)$/][value.type='Literal']",
          "JSXAttribute[name.name=/^(lang|dir)$/] > JSXExpressionContainer > Literal",
          "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/][arguments.length=0]",
          "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/] > Literal.arguments",
          ":matches(NewExpression, CallExpression)[callee.object.name='Intl'][arguments.length=0]",
          ":matches(NewExpression, CallExpression)[callee.object.name='Intl'] > Literal.arguments",
        ].map((selector) => ({
          selector,
          message:
            "Language, direction and formatting locale come from @/lib/locale (decision D6).",
        })),
      ],
    },
  },

  // RTL and the sqrt(2) token system.
  {
    files: ["**/*.tsx"],
    plugins: { "better-tailwindcss": betterTailwind },
    settings: { "better-tailwindcss": { entryPoint: "src/app/globals.css" } },
    rules: {
      ...betterTailwind.configs["correctness-error"].rules,
      "better-tailwindcss/enforce-logical-properties": ["error", { ignore: DIRECTION_AGNOSTIC }],
      "better-tailwindcss/no-deprecated-classes": "error",
      "better-tailwindcss/no-duplicate-classes": "error",
      "better-tailwindcss/no-restricted-classes": [
        "error",
        {
          restrict: [
            {
              pattern: PHYSICAL_BORDERS_AND_CORNERS,
              message:
                "Physical side in an RTL product. Use border-s/border-e and rounded-s/-e/-ss/-se/-es/-ee.",
            },
            {
              pattern: ARBITRARY_VALUE,
              message:
                "Arbitrary values bypass the brand tokens. Use a token from design/tokens (see globals.css @theme).",
            },
          ],
        },
      ],
    },
  },

  // Smells, import order, explained escape hatches (shared base).
  ...hygiene,

  // Tests and stories.
  ...tests,
  // testing-library for browser tests only. Stories use Storybook's scoped
  // `canvas`, which its prefer-screen-queries rule would wrongly reject.
  { files: ["**/*.test.tsx"], ...testingLibrary.configs["flat/react"] },
  ...storybook.configs["flat/recommended"],

  // Formatting belongs to Prettier. Keep last.
  formatting,
]);
