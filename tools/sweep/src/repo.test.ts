// The real repo: the checks fail when a relative link breaks, a spec, plan or research
// file names no bead, or graphify reaches an agent's instructions. turbo.json
// makes every Markdown file and .claude/ an input of this test, and
// pnpm check:push and check:full run `pnpm sweep lint` on every change (CI17).
import path from "node:path";
import { expect, it } from "vitest";

import { lint } from "./lint.ts";

const REPO = path.join(import.meta.dirname, "../../..");

it("keeps the repo's links, bead headers and graphify fence", () => {
  expect(lint(REPO)).toEqual([]);
});
