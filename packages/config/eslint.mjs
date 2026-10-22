// The lint base every TypeScript package shares.
// Each package's eslint.config.mjs composes these parts with its own rules:
//
//   typescript({ tsconfigRootDir })  strict, type-aware correctness
//   hygiene                          smells, import order, explained escape hatches
//   tests                            Vitest's rules for *.test.* files
//   formatting                       turns off what Prettier owns -- keep it LAST
import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import vitest from "@vitest/eslint-plugin";
import prettier from "eslint-config-prettier/flat";
import perfectionist from "eslint-plugin-perfectionist";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";

// `import { z } from "zod"` pulls all 64 of zod's locale files into a bundle
// (a third of the backend Lambda bundle, 1.04 MB -> 684 KB); `import * as z from "zod"`
// tree-shakes them. ESLint's no-restricted-imports cannot tell the two apart.
const zodNamespaceImport = {
  meta: {
    messages: { useNamespace: 'Use `import * as z from "zod"`: it tree-shakes zod\'s locales.' },
    type: "problem",
  },
  create: (context) => ({
    ImportDeclaration(node) {
      // Type-only imports are erased, so they cost nothing.
      if (node.source.value !== "zod" || node.importKind === "type") return;
      for (const specifier of node.specifiers) {
        if (
          specifier.type === "ImportSpecifier" &&
          specifier.importKind !== "type" &&
          specifier.imported.name === "z"
        ) {
          context.report({ messageId: "useNamespace", node: specifier });
        }
      }
    },
  }),
};

/** Type-aware correctness: unhandled promises, leaking any, dead conditions. */
export function typescript({ tsconfigRootDir }) {
  return [
    {
      files: ["**/*.{ts,tsx,mts}"],
      extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
      languageOptions: { parserOptions: { projectService: true, tsconfigRootDir } },
      plugins: { acme: { rules: { "zod-namespace-import": zodNamespaceImport } } },
      rules: { "acme/zod-namespace-import": "error" },
    },
  ];
}

export const hygiene = [
  // Smells.
  sonarjs.configs.recommended,

  // Import and export order, autofixed.
  {
    plugins: { perfectionist },
    rules: {
      "perfectionist/sort-imports": ["error", { type: "natural" }],
      "perfectionist/sort-named-imports": ["error", { type: "natural" }],
      "perfectionist/sort-exports": ["error", { type: "natural" }],
      "perfectionist/sort-named-exports": ["error", { type: "natural" }],
    },
  },

  // Escape hatches must explain themselves.
  comments.recommended,
  {
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: { "@eslint-community/eslint-comments/require-description": "error" },
  },
];

export const tests = [{ files: ["**/*.test.{ts,tsx}"], ...vitest.configs.recommended }];

export const formatting = prettier;

// typescript-eslint's parser, for packages that also lint plain JS.
export const parser = tseslint.parser;
