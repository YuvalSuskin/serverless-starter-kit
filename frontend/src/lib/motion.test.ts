import { describe, expect, it, vi } from "vitest";

import { MOTION, useMotionPresets } from "./motion";

const mockUseReducedMotion = vi.fn<() => boolean | null>(() => false);

vi.mock("motion/react", () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));

describe("MOTION", () => {
  it("defines fast, base, slow in seconds and ease as a 4-number tuple", () => {
    expect(MOTION.fast).toBeCloseTo(0.15, 5);
    expect(MOTION.base).toBeCloseTo(0.2, 5);
    expect(MOTION.slow).toBeCloseTo(0.25, 5);
    expect(MOTION.ease).toEqual([0.4, 0, 0.2, 1]);
  });
});

describe("useMotionPresets", () => {
  it("returns fadeIn, fadeOut and rise with base duration under normal motion", () => {
    mockUseReducedMotion.mockReturnValue(false);
    const presets = useMotionPresets();

    expect(presets.fadeIn.initial.opacity).toBe(0);
    expect(presets.fadeIn.transition.duration).toBe(MOTION.base);
    expect(presets.fadeOut.transition.duration).toBe(MOTION.base);
    expect(presets.rise.transition.duration).toBe(MOTION.base);
    expect(presets.rise.initial.y).toBe(6);
  });

  it("zeroes durations and offsets under prefers-reduced-motion: reduce", () => {
    mockUseReducedMotion.mockReturnValue(true);
    const presets = useMotionPresets();

    expect(presets.fadeIn.initial.opacity).toBe(1);
    expect(presets.fadeIn.transition.duration).toBe(0);
    expect(presets.fadeOut.transition.duration).toBe(0);
    expect(presets.rise.transition.duration).toBe(0);
    expect(presets.fadeIn.animate.transition?.duration).toBe(0);
    expect(presets.fadeOut.animate.transition?.duration).toBe(0);
    expect(presets.rise.animate.transition?.duration).toBe(0);
    expect(presets.rise.initial.y).toBe(0);
  });
});
