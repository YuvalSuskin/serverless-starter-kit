/* eslint-disable sonarjs/no-hardcoded-ip -- the addresses are the subject of these tests */
import { describe, expect, it } from "vitest";

import { isLoopbackHost } from "./loopback.ts";

describe("isLoopbackHost", () => {
  it("allows the machine itself", () => {
    const hosts = [
      "localhost",
      "LOCALHOST",
      "localhost.",
      "app.localhost",
      "127.0.0.1",
      "127.8.9.10",
      "::1",
      "[::1]",
      "0:0:0:0:0:0:0:1",
      "::ffff:127.0.0.1",
    ];
    expect(hosts.filter((host) => !isLoopbackHost(host))).toEqual([]);
  });

  it("refuses everything else, however it is dressed", () => {
    const hosts = [
      "1.1.1.1",
      "8.8.8.8",
      "10.0.0.1",
      "192.168.1.5",
      "0.0.0.0",
      "::",
      "fe80::1",
      "example.com",
      "localhost.example.com",
      "127.0.0.1.example.com",
      "notlocalhost",
      "::ffff:8.8.8.8",
      "",
    ];
    expect(hosts.filter((host) => isLoopbackHost(host))).toEqual([]);
  });
});
/* eslint-enable sonarjs/no-hardcoded-ip -- end of the addresses */
