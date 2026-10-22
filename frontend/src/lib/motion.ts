import type { TargetAndTransition, Transition } from "motion/react";

import { useReducedMotion } from "motion/react";

/**
 * Hand-kept mirror of `design/tokens/tokens.json`'s `motion` group,
 * converted from milliseconds to seconds for Motion's API.
 *
 * Per frontend/CLAUDE.md, `design/` is read only through `@acme/design`'s
 * exports, so this file does not import `tokens.json` directly. The values
 * here are pinned against the built `tokens.css` in `frontend/tests/theme-parity.test.ts`.
 */
export const MOTION: {
  readonly fast: number;
  readonly base: number;
  readonly slow: number;
  readonly ease: readonly [number, number, number, number];
} = {
  fast: 0.15,
  base: 0.2,
  slow: 0.25,
  ease: [0.4, 0, 0.2, 1],
} as const;

interface MotionPreset {
  readonly initial: TargetAndTransition;
  readonly animate: TargetAndTransition;
  readonly exit: TargetAndTransition;
  readonly transition: Transition;
}

export interface MotionPresets {
  readonly fadeIn: MotionPreset;
  readonly fadeOut: MotionPreset;
  readonly rise: MotionPreset;
}

/**
 * Motion presets for entry, exit and rise animations that honour reduced motion.
 *
 * MotionConfig alone does NOT zero out opacity transitions (only transform and
 * layout), so presets that animate opacity must check reduced motion themselves.
 * When `prefers-reduced-motion: reduce` is active, transition durations and
 * translate offsets resolve to 0.
 */
export function useMotionPresets(): MotionPresets {
  const shouldReduce = useReducedMotion();
  const reduce = shouldReduce ?? false;
  const duration = reduce ? 0 : MOTION.base;
  const transition: Transition = { duration, ease: MOTION.ease };

  return {
    fadeIn: {
      initial: { opacity: reduce ? 1 : 0 },
      animate: { opacity: 1, transition },
      exit: { opacity: 0, transition },
      transition,
    },
    fadeOut: {
      initial: { opacity: 1 },
      animate: { opacity: 0, transition },
      exit: { opacity: 0, transition },
      transition,
    },
    rise: {
      initial: { opacity: reduce ? 1 : 0, y: reduce ? 0 : 6 },
      animate: { opacity: 1, y: 0, transition },
      exit: { opacity: 0, y: reduce ? 0 : 6, transition },
      transition,
    },
  };
}
