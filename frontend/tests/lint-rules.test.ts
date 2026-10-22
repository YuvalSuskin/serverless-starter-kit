// Pins the lint rules that carry the spec's guarantees.
// If a plugin upgrade or a config edit silently disables one, this fails.
import { ESLint } from "eslint";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

// The probe files exist only in memory. typescript-eslint's project service
// rejects paths it cannot find on disk, so these (and only these, only in this
// test) are served from a default project built from the real tsconfig.json.
const PROBE_FILES = [
  "src/ui/probe.tsx",
  "src/ui/probe.test.tsx",
  "src/ui/probe.stories.tsx",
  "src/lib/probe.ts",
  "src/lib/data/probe.ts",
  "src/app/(marketing)/probe.tsx",
  "e2e/probe.spec.ts",
  "e2e/probe.test.ts",
  "e2e/nested/probe.spec.ts",
  "e2e/probe.ts",
];

// A case is milliseconds of work, but it runs while the browser projects
// start. On a saturated machine a lint call waits seconds for a CPU: a case
// that takes 20 ms alone was measured at 5.5 s, past Vitest's default of 5 s.
vi.setConfig({ testTimeout: 30_000 });

let eslint: ESLint;
let fixer: ESLint;

beforeAll(async () => {
  const options = {
    cwd: path.join(import.meta.dirname, ".."),
    overrideConfig: {
      files: ["**/*.{ts,tsx}"],
      languageOptions: {
        parserOptions: {
          projectService: {
            allowDefaultProject: PROBE_FILES,
            defaultProject: "tsconfig.json",
            // The default is 8 files; there are more probes than that.
            maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 16,
          },
        },
      },
    },
  };
  eslint = new ESLint(options);
  fixer = new ESLint({ ...options, fix: true });
  // The first lint builds the TypeScript program and loads Tailwind's design
  // system (seconds, not milliseconds). Pay for it here, not inside a test.
  await Promise.all(
    [eslint, fixer].map((instance) =>
      instance.lintText("export {};\n", { filePath: "src/ui/probe.tsx" }),
    ),
  );
}, 60_000);

// Lints `code` as if it lived at `filePath` (relative to frontend/) and
// returns the ids of the rules that fired.
async function rulesFiredFor(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((message) => message.ruleId ?? "(parse error)");
}

const component = (className: string) =>
  `export function Probe() {\n  return <div className="${className}" />;\n}\n`;

describe("RTL: physical inline-axis classes are rejected", () => {
  it.each(["ml-4", "pr-2", "left-0", "text-right", "md:mr-2"])("%s", async (className) => {
    expect(await rulesFiredFor("src/ui/probe.tsx", component(className))).toContain(
      "better-tailwindcss/enforce-logical-properties",
    );
  });

  it.each(["border-l", "border-r-2", "rounded-tl-card", "rounded-r-pill"])(
    "%s",
    async (className) => {
      expect(await rulesFiredFor("src/ui/probe.tsx", component(className))).toContain(
        "better-tailwindcss/no-restricted-classes",
      );
    },
  );

  it("autofixes them to their logical equivalents (pnpm fix)", async () => {
    const [result] = await fixer.lintText(component("ml-4 text-right"), {
      filePath: "src/ui/probe.tsx",
    });
    expect(result?.output).toContain('className="ms-4 text-end"');
  });

  it.each(["ms-4", "pe-2", "start-0", "text-end", "h-10", "w-4", "size-4", "mt-2", "border-s"])(
    "allows %s",
    async (className) => {
      expect(await rulesFiredFor("src/ui/probe.tsx", component(className))).toEqual([]);
    },
  );
});

describe("tokens: off-scale and arbitrary values are rejected", () => {
  it.each(["text-sm", "rounded-md"])("%s does not exist", async (className) => {
    expect(await rulesFiredFor("src/ui/probe.tsx", component(className))).toContain(
      "better-tailwindcss/no-unknown-classes",
    );
  });

  it.each([
    "text-[13px]",
    "rounded-[6px]",
    "bg-[#fff]",
    "md:ring-[3px]",
    "bg-(--grey-900)",
    "[mask-type:luminance]",
    // Modifiers and important flags must not smuggle an arbitrary value past the ban.
    "text-[13px]/7",
    "!text-[13px]",
    "bg-[#fff]/50",
    "bg-grey-900/[0.3]",
    "text-100/[20px]",
  ])("%s", async (className) => {
    expect(await rulesFiredFor("src/ui/probe.tsx", component(className))).toContain(
      "better-tailwindcss/no-restricted-classes",
    );
  });

  it.each([
    "text-100 rounded-pill bg-grey-900",
    "text-075",
    "text-050 text-grey-900",
    "bg-grey-900/50 hover:bg-primary/90",
    "has-[>svg]:px-3",
    "data-[state=open]:bg-grey-200",
  ])("allows %s", async (className) => {
    expect(await rulesFiredFor("src/ui/probe.tsx", component(className))).toEqual([]);
  });

  it("knows the brand sizes: two of them on one element conflict", async () => {
    expect(await rulesFiredFor("src/ui/probe.tsx", component("text-075 text-050"))).toContain(
      "better-tailwindcss/no-conflicting-classes",
    );
  });

  it("checks class strings inside cn()", async () => {
    const code = `import { cn } from "@/lib/utils";\n\nexport const c = cn("text-[13px]");\n`;
    expect(await rulesFiredFor("src/ui/probe.tsx", code)).toContain(
      "better-tailwindcss/no-restricted-classes",
    );
  });
});

describe("architecture: the layering is enforced", () => {
  it("ui may not import route code", async () => {
    const code = `import RootLayout from "@/app/layout";\n\nexport const x = RootLayout;\n`;
    expect(await rulesFiredFor("src/ui/probe.tsx", code)).toContain("boundaries/dependencies");
  });

  it("lib may not import ui", async () => {
    const code = `import { Button } from "@/ui/button";\n\nexport const x = Button;\n`;
    expect(await rulesFiredFor("src/lib/probe.ts", code)).toContain("boundaries/dependencies");
  });

  it("one pillar may not import another", async () => {
    const code = `import MessagesPage from "@/app/(app)/messages/page";\n\nexport const x = MessagesPage;\n`;
    expect(await rulesFiredFor("src/app/(marketing)/probe.tsx", code)).toContain(
      "boundaries/dependencies",
    );
  });

  it("ui may import lib", async () => {
    const code = `import { cn } from "@/lib/utils";\n\nexport const x = cn;\n`;
    expect(await rulesFiredFor("src/ui/probe.tsx", code)).toEqual([]);
  });

  it("a pillar may import ui", async () => {
    const code = `import { Button } from "@/ui/button";\n\nexport const x = Button;\n`;
    expect(await rulesFiredFor("src/app/(marketing)/probe.tsx", code)).toEqual([]);
  });
});

describe("data: server state goes through the src/lib/data hooks (D1)", () => {
  const typeImport = `import type { QueryResult } from "@/lib/data/types";\n\nexport type X = QueryResult<number>;\n`;

  it("ui may not import the data layer", async () => {
    expect(await rulesFiredFor("src/ui/probe.tsx", typeImport)).toContain(
      "boundaries/dependencies",
    );
  });

  it("the rest of lib may not import the data layer", async () => {
    expect(await rulesFiredFor("src/lib/probe.ts", typeImport)).toContain(
      "boundaries/dependencies",
    );
  });

  it("a pillar may import the data layer", async () => {
    expect(await rulesFiredFor("src/app/(marketing)/probe.tsx", typeImport)).toEqual([]);
  });

  it("swr is banned outside src/lib/data", async () => {
    const code = `import useSWR from "swr";\n\nexport const x = useSWR;\n`;
    expect(await rulesFiredFor("src/ui/probe.tsx", code)).toContain("no-restricted-imports");
  });

  it("swr is allowed inside src/lib/data", async () => {
    const code = `export { default as useSWR } from "swr";\n`;
    expect(await rulesFiredFor("src/lib/data/probe.ts", code)).toEqual([]);
  });
});

describe("e2e specs", () => {
  // The offline step blocks the browser through e2e/test.ts's fixture (root
  // CLAUDE.md, "Local first"): a spec on Playwright's own `test` is not covered.
  it("a spec may not import test from @playwright/test", async () => {
    const code = `import { expect, test } from "@playwright/test";\n\ntest("x", async ({ page }) => {\n  await expect(page).toHaveTitle("x");\n});\n`;
    expect(await rulesFiredFor("e2e/probe.spec.ts", code)).toContain("no-restricted-imports");
  });

  it("a nested spec, and a .test.ts file Playwright would run, are held to it too", async () => {
    const code = `import { test } from "@playwright/test";\n\ntest("x", async ({ page }) => {\n  await page.goto("/");\n});\n`;
    expect(await rulesFiredFor("e2e/nested/probe.spec.ts", code)).toContain(
      "no-restricted-imports",
    );
    expect(await rulesFiredFor("e2e/probe.test.ts", code)).toContain("no-restricted-imports");
  });

  it("a spec may import test from ./test", async () => {
    const code = `import { expect, test } from "./test";\n\ntest("x", async ({ page }) => {\n  await expect(page).toHaveTitle("x");\n});\n`;
    expect(await rulesFiredFor("e2e/probe.spec.ts", code)).toEqual([]);
  });

  it("a helper (not a spec) may import from @playwright/test", async () => {
    const code = `import { expect, type Page } from "@playwright/test";\n\nexport const x = (page: Page) => expect(page);\n`;
    expect(await rulesFiredFor("e2e/probe.ts", code)).toEqual([]);
  });
});

describe("backend contracts", () => {
  it("page code may not call the API client directly", async () => {
    const code = `import { publicCall } from "@/lib/data/public-call";\n\nexport const x = publicCall;\n`;
    expect(await rulesFiredFor("src/app/(marketing)/probe.tsx", code)).toContain(
      "no-restricted-imports",
    );
  });

  // "member-call" does not exist in the template: it probes the `@/lib/data/*-call`
  // pattern, which covers every audience's entry point a project adds.
  it.each(["api-client", "public-call", "member-call"])(
    "page code may not import the %s module either",
    async (module) => {
      const code = `import * as client from "@/lib/data/${module}";\n\nexport const x = client;\n`;
      expect(await rulesFiredFor("src/app/(marketing)/probe.tsx", code)).toContain(
        "no-restricted-imports",
      );
    },
  );

  it.each(["core", "public"])(
    "page code may not import the %s route table or constants directly",
    async (part) => {
      const code = `import * as client from "@acme/contracts/client/${part}";\n\nexport const x = client;\n`;
      expect(await rulesFiredFor("src/app/(marketing)/probe.tsx", code)).toContain(
        "no-restricted-imports",
      );
    },
  );

  it("page code may not import a contract value, which would bundle zod", async () => {
    const code = `import { contracts } from "@acme/contracts";\n\nexport const x = contracts;\n`;
    expect(await rulesFiredFor("src/lib/data/probe.ts", code)).toContain(
      "@typescript-eslint/no-restricted-imports",
    );
  });

  it("page code may import contract types", async () => {
    const code = `import type { Audience } from "@acme/contracts";\n\nexport type X = Audience;\n`;
    expect(await rulesFiredFor("src/lib/data/probe.ts", code)).toEqual([]);
  });
});

// The touch-gesture helpers dispatch synthetic events; they are test code.
describe("gestures: only tests and stories import the touch helpers", () => {
  const code = `import { tap } from "@/lib/gestures";\n\nexport const x = tap;\n`;

  it("product code may not import them", async () => {
    expect(await rulesFiredFor("src/ui/probe.tsx", code)).toContain(
      "@typescript-eslint/no-restricted-imports",
    );
  });

  it("product code may not reach them by a relative path either", async () => {
    const relative = `import { tap } from "./gestures";\n\nexport const x = tap;\n`;
    expect(await rulesFiredFor("src/lib/probe.ts", relative)).toContain(
      "@typescript-eslint/no-restricted-imports",
    );
  });

  it.each(["src/ui/probe.test.tsx", "src/ui/probe.stories.tsx"])(
    "%s may import them",
    async (file) => {
      expect(await rulesFiredFor(file, code)).not.toContain(
        "@typescript-eslint/no-restricted-imports",
      );
    },
  );
});

describe("geometry: only tests and stories import the geometry helpers", () => {
  const code = `import { expectSameBox } from "@/lib/geometry";\n\nexport const x = expectSameBox;\n`;

  it("product code may not import it", async () => {
    expect(await rulesFiredFor("src/ui/probe.tsx", code)).toContain(
      "@typescript-eslint/no-restricted-imports",
    );
  });

  it("product code may not reach it by a relative path either", async () => {
    const relative = `import { expectSameBox } from "./geometry";\n\nexport const x = expectSameBox;\n`;
    expect(await rulesFiredFor("src/lib/probe.ts", relative)).toContain(
      "@typescript-eslint/no-restricted-imports",
    );
  });

  it.each(["src/ui/probe.test.tsx", "src/ui/probe.stories.tsx"])(
    "%s may import it",
    async (file) => {
      expect(await rulesFiredFor(file, code)).not.toContain(
        "@typescript-eslint/no-restricted-imports",
      );
    },
  );
});

describe("locale: language, direction and formatting come from @/lib/locale (D6)", () => {
  it.each([
    ['<div dir="rtl" />', "a hard-coded dir"],
    ['<div lang="he" />', "a hard-coded lang"],
    ['<div dir={"rtl"} />', "a hard-coded dir in braces"],
  ])("rejects %s (%s)", async (jsx) => {
    const code = `export function Probe() {\n  return ${jsx};\n}\n`;
    expect(await rulesFiredFor("src/ui/probe.tsx", code)).toContain("no-restricted-syntax");
  });

  it.each([
    ["new Date().toLocaleDateString()", "toLocale* with no locale"],
    ['(3).toLocaleString("he-IL")', "toLocale* with a hard-coded locale"],
    ["new Intl.NumberFormat()", "Intl with no locale"],
    ['new Intl.NumberFormat("he-IL")', "Intl with a hard-coded locale"],
    ['Intl.DateTimeFormat("he")', "Intl called without new"],
  ])("rejects %s (%s)", async (expression) => {
    const code = `export const x = ${expression};\n`;
    expect(await rulesFiredFor("src/lib/probe.ts", code)).toContain("no-restricted-syntax");
  });

  it("allows Intl and toLocale* with LOCALE", async () => {
    const code = `import { LOCALE } from "@/lib/locale";\n\nexport const a = new Intl.NumberFormat(LOCALE);\nexport const b = new Date().toLocaleDateString(LOCALE);\n`;
    expect(await rulesFiredFor("src/lib/probe.ts", code)).toEqual([]);
  });

  it("allows dir and lang read from the locale module", async () => {
    const code = `import { DIRECTION, LOCALE } from "@/lib/locale";\n\nexport function Probe() {\n  return <div dir={DIRECTION} lang={LOCALE} />;\n}\n`;
    expect(await rulesFiredFor("src/ui/probe.tsx", code)).toEqual([]);
  });
});

describe("correctness: promises must be handled", () => {
  it("rejects a floating promise", async () => {
    const code = `export function f(): void {\n  fetch("/x");\n}\n`;
    expect(await rulesFiredFor("src/lib/probe.ts", code)).toContain(
      "@typescript-eslint/no-floating-promises",
    );
  });
});

describe("escape hatches: disables must explain themselves", () => {
  it("rejects a bare eslint-disable", async () => {
    const code = `// eslint-disable-next-line no-console\nconsole.log(1);\n`;
    expect(await rulesFiredFor("src/lib/probe.ts", code)).toContain(
      "@eslint-community/eslint-comments/require-description",
    );
  });
});
