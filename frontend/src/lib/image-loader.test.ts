import { describe, expect, it } from "vitest";

import imageLoader from "./image-loader";

describe("imageLoader", () => {
  it("returns the URL unchanged, at any width: the backend made the sizes", () => {
    const src = "/media/events/e1/thumbs/400/abc.webp";
    expect(imageLoader({ src, width: 400 })).toBe(src);
    expect(imageLoader({ src, width: 1920 })).toBe(src);
  });
});
