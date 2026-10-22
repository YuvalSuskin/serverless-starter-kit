// pnpm tracker:drop-remote: makes the tracker local only. Removes `sync.remote`
// from `.beads/config.yaml` (both the nested form bd init writes and the flat
// one; `bd config unset` misses the nested form, TB142) and every Dolt remote
// bd lists, then checks bd and the file agree nothing is left. Never pushes.
import { execFileSync, spawnSync } from "node:child_process";

import { removeTrackerRemote } from "./tracker-config.ts";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => key !== "BEADS_DIR" && key !== "BEADS_DB"),
);
const { done, left } = removeTrackerRemote(root, (cmd, args) =>
  spawnSync(cmd, args, { cwd: root, encoding: "utf8", env }),
);
for (const line of done) console.log(`tracker:drop-remote: ${line}`);
if (left.length > 0) {
  console.error("tracker:drop-remote: still there:");
  for (const line of left) console.error(`  ${line}`);
  process.exitCode = 1;
} else {
  console.log(
    `tracker:drop-remote: the tracker is local only${done.length === 0 ? " (it already was)" : ""}; commit the change to .beads/config.yaml.`,
  );
}
