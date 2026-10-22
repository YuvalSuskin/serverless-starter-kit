import { describe, expect, it } from "vitest";

import {
  allocatePorts,
  PORT_BASE,
  portsForSlot,
  previewUrl,
  slotFor,
  SLOTS,
  slugFromBranch,
  uniqueSlug,
} from "./naming.ts";

describe("slugFromBranch", () => {
  it.each([
    ["claude/frontend-folder-structure-552205", "frontend-folder-structure"],
    ["main", "main"],
    ["feature/Photo_Grid", "feature-photo-grid"],
    ["claude/---", "preview"],
    ["harness-engineering-research-aadbd7", "harness-engineering-research"],
  ])("%s -> %s", (branch, slug) => {
    expect(slugFromBranch(branch)).toBe(slug);
  });

  it("fits a DNS label and never ends in a hyphen", () => {
    const slug = slugFromBranch(`${"a".repeat(62)}-b-c`);
    expect(slug.length).toBeLessThanOrEqual(63);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("uniqueSlug", () => {
  it("keeps a slug nobody else uses", () => {
    expect(uniqueSlug("shop", "claude/shop-111111", new Set(["other"]))).toBe("shop");
  });

  it("adds 4 hex characters of the seed's hash when the slug is taken", () => {
    const first = uniqueSlug("shop", "claude/shop-111111", new Set(["shop"]));
    expect(first).toMatch(/^shop-[0-9a-f]{4}$/);
    expect(uniqueSlug("shop", "claude/shop-111111", new Set(["shop"]))).toBe(first);
  });
});

describe("ports", () => {
  it("gives a worktree the same slot every time, inside the range", () => {
    const slot = slotFor("/repo/.claude/worktrees/a");
    expect(slotFor("/repo/.claude/worktrees/a")).toBe(slot);
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(slot).toBeLessThan(SLOTS);
  });

  it("pairs each web port with the next port for the API, within 4300-4999", () => {
    expect(portsForSlot(0)).toEqual({ api: PORT_BASE + 1, web: PORT_BASE });
    expect(portsForSlot(SLOTS - 1)).toEqual({ api: 4999, web: 4998 });
    expect(portsForSlot(SLOTS)).toEqual(portsForSlot(0));
  });

  it("moves to the next slot when either port is busy", async () => {
    const own = portsForSlot(slotFor("/w"));
    const ports = await allocatePorts("/w", (port) => Promise.resolve(port !== own.api));
    expect(ports).toEqual(portsForSlot(slotFor("/w") + 1));
  });

  it("gives up when every slot is busy", async () => {
    expect(await allocatePorts("/w", () => Promise.resolve(false))).toBeUndefined();
  });

  it("builds a *.localhost URL on the web port", () => {
    expect(previewUrl("shop", { api: 4301, web: 4300 })).toBe("http://shop.localhost:4300");
  });
});
