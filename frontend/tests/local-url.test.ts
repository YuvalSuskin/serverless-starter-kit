/* eslint-disable sonarjs/no-clear-text-protocols -- local URLs are what the rule is about */
import { describe, expect, it } from "vitest";

import { isLocalUrl } from "../e2e/local-url";

describe("isLocalUrl (the offline step's browser rule)", () => {
  it("is true for this machine", () => {
    const urls = [
      "http://localhost:3000/",
      "http://127.0.0.1:8787/api/health",
      "http://[::1]:3000/",
      "http://app.localhost/",
      "ws://localhost:3000/_next/webpack-hmr",
      "data:image/png;base64,AAAA",
      "blob:http://localhost:3000/abc",
      "about:blank",
    ];
    expect(urls.filter((url) => !isLocalUrl(url))).toEqual([]);
  });

  it("is false for anything else", () => {
    const urls = [
      "https://fonts.googleapis.com/css2?family=Inter",
      "https://example.com/",
      "http://1.1.1.1/",
      "http://localhost.example.com/",
      "http://127.0.0.1.example.com/",
      "not a url",
    ];
    expect(urls.filter((url) => isLocalUrl(url))).toEqual([]);
  });
});
/* eslint-enable sonarjs/no-clear-text-protocols -- end of the addresses */
