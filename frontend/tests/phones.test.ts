// The iPhone e2e project is left out only where Playwright's WebKit cannot run.
// A guard that misfired on Linux would drop it from
// CI without a single test failing, so it is pinned here.
import { expect, it } from "vitest";

import { phoneProjects } from "../e2e/phones";

const names = (host: { platform: NodeJS.Platform; release: string }) =>
  phoneProjects(host).map((project) => project.name);

it("runs both phones on Linux, where CI runs", () => {
  expect(names({ platform: "linux", release: "6.8.0-1017-azure" })).toEqual(["iphone", "android"]);
});

it("runs both phones on macOS 15 and later", () => {
  expect(names({ platform: "darwin", release: "24.0.0" })).toEqual(["iphone", "android"]);
});

it("leaves the iPhone out on macOS 14, whose Playwright WebKit is broken", () => {
  expect(names({ platform: "darwin", release: "23.6.0" })).toEqual(["android"]);
});
