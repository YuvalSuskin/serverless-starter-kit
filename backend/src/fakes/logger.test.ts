import { describe, expect, it, vi } from "vitest";

import { recordingLogger } from "./logger";

describe("recordingLogger", () => {
  it("keeps every line for a test to inspect", () => {
    const log = recordingLogger();
    log.info("hello", { unitId: "demo" });
    expect(log.lines).toEqual([expect.objectContaining({ level: "info", message: "hello" })]);
  });

  // The dev server prints, and runs for hours: keeping every line too would
  // grow without bound.
  it("with print, writes each line and keeps none", () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const log = recordingLogger({ print: true });
    log.info("hello", { unitId: "demo" });
    expect(write).toHaveBeenCalledWith(expect.stringContaining("INFO hello"));
    expect(log.lines).toEqual([]);
    write.mockRestore();
  });
});
