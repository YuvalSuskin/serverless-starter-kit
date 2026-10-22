import { createHash } from "node:crypto";

/** Slot n uses web = PORT_BASE + 2n and api = web + 1. */
export const PORT_BASE = 4300;
/** The slots in 4300-4999. */
export const SLOTS = 350;

const DNS_LABEL_MAX = 63;

export interface Ports {
  api: number;
  web: number;
}

function trimTrailingHyphens(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "-") end--;
  return value.slice(0, end);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** `claude/frontend-folder-structure-552205` -> `frontend-folder-structure`. */
export function slugFromBranch(branch: string): string {
  const slug = trimTrailingHyphens(
    branch
      .replace(/^claude\//, "")
      .replace(/-[0-9a-f]{6}$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+/, "")
      .slice(0, DNS_LABEL_MAX),
  );
  return slug === "" ? "preview" : slug;
}

/** Another running preview has the slug: add 4 hex characters of the seed's hash. */
export function uniqueSlug(slug: string, seed: string, taken: ReadonlySet<string>): string {
  if (!taken.has(slug)) return slug;
  const base = trimTrailingHyphens(slug.slice(0, DNS_LABEL_MAX - 5));
  return `${base}-${sha256(seed).slice(0, 4)}`;
}

export function slotFor(worktreePath: string): number {
  return Number.parseInt(sha256(worktreePath).slice(0, 8), 16) % SLOTS;
}

export function portsForSlot(slot: number): Ports {
  const web = PORT_BASE + 2 * (slot % SLOTS);
  return { api: web + 1, web };
}

/** The worktree's own slot or, if either port is busy, the next free one. */
export async function allocatePorts(
  worktreePath: string,
  isFree: (port: number) => Promise<boolean>,
): Promise<Ports | undefined> {
  const start = slotFor(worktreePath);
  for (let offset = 0; offset < SLOTS; offset++) {
    const ports = portsForSlot(start + offset);
    if ((await isFree(ports.web)) && (await isFree(ports.api))) return ports;
  }
  return undefined;
}

export function previewUrl(slug: string, ports: Ports): string {
  return `http://${slug}.localhost:${String(ports.web)}`;
}
