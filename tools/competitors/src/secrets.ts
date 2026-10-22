// The SerpApi key: the environment first, then `.env.local` at
// this checkout's root, then at the main checkout's, so one file serves every
// worktree. The key is read only here, and never printed.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const NAME = "SERPAPI_API_KEY";

/** A value with something in it, trimmed; an empty one counts as absent. */
const filled = (value: string | undefined) => (value?.trim() ? value.trim() : undefined);

function fromFile(root: string): string | undefined {
  const file = path.join(root, ".env.local");
  if (!existsSync(file)) return undefined;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    // KEY=value, with or without `export ` and quotes, as dotenv files have it.
    const [key, ...rest] = line.replace(/^\s*export\s+/, "").split("=");
    if (key?.trim() !== NAME) continue;
    const value = rest.join("=").trim();
    const quoted = /^(["'])(.*)\1$/.exec(value);
    return filled(quoted ? quoted[2] : value);
  }
  return undefined;
}

export function findSerpApiKey(
  env: Record<string, string | undefined>,
  checkoutRoot: string,
  mainRoot: string,
): string | undefined {
  return filled(env[NAME]) ?? fromFile(checkoutRoot) ?? fromFile(mainRoot);
}

/** The main checkout's root: the parent of git's common directory. */
export function mainCheckoutRoot(checkoutRoot: string): string {
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: checkoutRoot,
    encoding: "utf8",
  }).trim();
  return path.dirname(common);
}
