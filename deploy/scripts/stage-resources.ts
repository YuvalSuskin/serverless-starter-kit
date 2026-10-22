// Skeleton: what `sst shell` hands a script: each linked resource of the
// stage as an SST_RESOURCE_<Name> variable holding JSON. Used by the smoke
// test.
import { spawnSync } from "node:child_process";

/** Re-runs this script inside `sst shell` for the stage, unless it already is; exits with it. */
export function inStageShell(stage: string, script: string, args: readonly string[]): void {
  if (process.env.SST_RESOURCE_App !== undefined) return;
  const shell = spawnSync("sst", ["shell", "--stage", stage, "--", "node", script, ...args], {
    stdio: "inherit",
  });
  process.exit(shell.status ?? 1);
}

/** A linked resource's properties, as `sst shell` passes them. */
export function resource(name: string): Record<string, string> | undefined {
  const raw = process.env[`SST_RESOURCE_${name}`];
  return raw === undefined ? undefined : (JSON.parse(raw) as Record<string, string>);
}
