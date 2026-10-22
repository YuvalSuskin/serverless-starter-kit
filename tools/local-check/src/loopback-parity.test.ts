/* eslint-disable sonarjs/no-hardcoded-ip, sonarjs/no-clear-text-protocols -- the addresses are the subject of this test */
// Two files state "this machine only": Node's (loopback.ts) and the browser's
// (frontend/e2e/local-url.ts, which frontend/ cannot import from here). One
// table of hosts goes through both, so they cannot drift.
import { describe, expect, it } from "vitest";

import { isLocalUrl } from "../../../frontend/e2e/local-url.ts";
import { isLoopbackHost } from "./loopback.ts";

const HOSTS = [
  "localhost",
  "LOCALHOST",
  "localhost.",
  "app.localhost",
  "deep.app.localhost",
  "127.0.0.1",
  "127.8.9.10",
  "127.0.0.256",
  "::1",
  "[::1]",
  "0:0:0:0:0:0:0:1",
  "::ffff:127.0.0.1",
  "::ffff:8.8.8.8",
  "::",
  "fe80::1",
  "0.0.0.0",
  "1.1.1.1",
  "10.0.0.1",
  "192.168.1.5",
  "example.com",
  "localhost.example.com",
  "127.0.0.1.example.com",
  "notlocalhost",
  "fonts.googleapis.com",
];

// A host as a URL spells it: an IPv6 address in brackets.
const urlOf = (host: string) => {
  const bracketed = host.includes(":") && !host.startsWith("[");
  return bracketed ? "http://[" + host + "]/" : "http://" + host + "/";
};

describe("the Node guard's and the browser's idea of this machine", () => {
  it("agree on every host in the table", () => {
    const node = Object.fromEntries(HOSTS.map((host) => [host, isLoopbackHost(host)]));
    const browser = Object.fromEntries(HOSTS.map((host) => [host, isLocalUrl(urlOf(host))]));
    expect(browser).toEqual(node);
  });

  it("the table has both kinds, so agreement is not two blanket answers", () => {
    const answers = HOSTS.map((host) => isLoopbackHost(host));
    expect(answers).toContain(true);
    expect(answers).toContain(false);
  });
});
/* eslint-enable sonarjs/no-hardcoded-ip, sonarjs/no-clear-text-protocols -- end of the addresses */
