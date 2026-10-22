// SST names each function's log group itself, with its own suffix, so a log
// group derived from the function's name does not exist: PutMetricFilter
// fails and the deploy stops. A metric filter reads the log group from the
// function's node instead (`.nodes.logGroup`).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = readFileSync(new URL("../sst.config.ts", import.meta.url), "utf8");

describe("sst.config.ts's log groups", () => {
  it("never derives a Lambda's log group from its function name", () => {
    expect(config).not.toMatch(/\/aws\/lambda\/\$\{/);
  });
});
