import type React from "react";

import { MotionConfig } from "motion/react";

/**
 * Root configuration provider for Motion animations (Part 2.1 rule 3).
 *
 * Wraps children in Motion's `<MotionConfig reducedMotion="user">` to honour
 * the user's `prefers-reduced-motion` setting for transform and layout values ONLY.
 *
 * NOTE: MotionConfig alone does NOT zero out opacity transitions.
 * Presets that animate opacity must check reduced motion themselves via
 * `useMotionPresets()` (or `useReducedMotion()`).
 *
 * Where MotionRoot mounts in the tree is an implementer call left for later tasks;
 * this primitive only defines the wrapper.
 */
export function MotionRoot({ children }: Readonly<{ children: React.ReactNode }>) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
