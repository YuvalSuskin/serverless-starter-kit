// The `test` every e2e spec imports. With ACME_OFFLINE=1 (the offline step of
// `pnpm check:full`, tools/local-check/src/offline.ts) it aborts every browser
// request that is not on this machine and fails the test if the page made one,
// even if the page coped: a font, a script or an API on someone else's server
// is a resource without a local stand-in (root CLAUDE.md, "Local first").
// Otherwise it is Playwright's `test`.
import { test as base, expect } from "@playwright/test";

import { blockOffMachine } from "./block-off-machine";

export { expect };
export type { Page } from "@playwright/test";

export const test = base.extend<{ onlyThisMachine: undefined }>({
  onlyThisMachine: [
    async ({ context }, use) => {
      const blocked = process.env.ACME_OFFLINE === "1" ? await blockOffMachine(context) : [];
      await use(undefined);
      expect(blocked, "requests to another machine, blocked").toEqual([]);
    },
    { auto: true },
  ],
});
