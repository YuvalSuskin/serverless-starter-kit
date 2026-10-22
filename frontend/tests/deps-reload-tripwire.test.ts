// a browser test run whose Vite server finds a package mid-run
// reloads its test pages and then fails at random or hangs; the tripwire ends
// it at once, naming the package.
import type { Logger, ViteDevServer } from "vite";

import { expect, it, vi } from "vitest";

import { depsReloadTripwire } from "./deps-reload-tripwire";

class Stopped extends Error {}

function serverWithLogger() {
  const said: string[] = [];
  const logger = {
    info: (message: string) => {
      said.push(message);
    },
  } as unknown as Logger;
  return { said, server: { config: { logger } } as unknown as ViteDevServer };
}

function start(fail: (message: string) => never) {
  const { said, server } = serverWithLogger();
  const plugin = depsReloadTripwire("browser", fail);
  const configure = plugin.configureServer;
  if (typeof configure !== "function") throw new Error("no configureServer hook");
  // It wraps the logger at once, with nothing to run after the server starts.
  expect(configure.call({} as never, server)).toBeUndefined();
  const { logger } = server.config;
  return {
    info: (message: string) => {
      logger.info(message);
    },
    said,
  };
}

it("stops the run when Vite reloads the test pages, naming the package it found", () => {
  const fail = vi.fn((message: string): never => {
    throw new Stopped(message);
  });
  const { info, said } = start(fail);
  info("\u001B[32m2:12:02 PM\u001B[39m [vite] (client) dependency optimized: nuqs");
  expect(fail).not.toHaveBeenCalled();
  expect(() => {
    info("[vite] (client) \u001B[32moptimized dependencies changed. reloading\u001B[39m");
  }).toThrow(Stopped);
  // Vite's own lines still reach the log, the reload's first.
  expect(said).toHaveLength(2);
  const message = fail.mock.calls[0]?.[0] ?? "";
  expect(message).toContain("[browser] Vite found nuqs only once tests were running");
  expect(message).toContain("Add nuqs to this project's optimizeDeps.include");
});

it("lets every other line through", () => {
  const fail = vi.fn((): never => {
    throw new Stopped();
  });
  const { info, said } = start(fail);
  info("[vite] (client) ✨ new dependencies optimized: uqr, jsqr");
  info("Port 63315 is in use, trying another one...");
  expect(fail).not.toHaveBeenCalled();
  expect(said).toHaveLength(2);
});
