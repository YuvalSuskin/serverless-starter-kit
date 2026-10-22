import path from "node:path";
// pnpm preview. Wires the real world into preview.ts.
import { fileURLToPath } from "node:url";

import type { Deps } from "./preview.ts";

import { parseCli, USAGE } from "./args.ts";
import { doctor } from "./doctor.ts";
import { gitCommonDir } from "./git.ts";
import { withLock } from "./lock.ts";
import { list, stop, up } from "./preview.ts";
import {
  isListening,
  isPortFree,
  launchDetached,
  realSignals,
  waitForHealth,
} from "./processes.ts";
import { run } from "./run.ts";

function realDeps(): Deps {
  const clock = { now: () => Date.now(), sleep: realSignals.sleep };
  return {
    cwd: process.cwd(),
    isListening: (port) => isListening(port),
    isPortFree,
    launch: launchDetached,
    now: () => new Date(),
    open: async (url) => {
      await run(process.platform === "darwin" ? "open" : "xdg-open", [url]);
    },
    out: (line) => {
      console.log(line);
    },
    run,
    signals: realSignals,
    waitForHealth: (url) => waitForHealth(url, fetch, clock),
    withLock: async (fn) =>
      withLock(path.join(await gitCommonDir({ cwd: process.cwd(), run }), "preview.lock"), fn),
  };
}

async function main(): Promise<number> {
  const command = parseCli(process.argv.slice(2));
  const deps = realDeps();
  switch (command.kind) {
    case "doctor": {
      return doctor(deps);
    }
    case "help": {
      if (command.message !== undefined) console.error(command.message);
      console.log(USAGE);
      return command.message === undefined ? 0 : 1;
    }
    case "list": {
      return list(deps);
    }
    case "stop": {
      return stop(command.target, command, deps);
    }
    case "up": {
      return up(command.target, command, deps);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main();
  } catch (error) {
    // A one-line reason, not a stack trace: the person running this is not debugging it.
    console.error(`pnpm preview: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
