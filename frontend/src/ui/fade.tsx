"use client";

import { AnimatePresence, domMin, LazyMotion, m, useIsPresent } from "motion/react";

import { useMotionPresets } from "@/lib/motion";
import { cn } from "@/lib/utils";

// Motion rule 3: a page's states and an overlay change with a short
// cross-fade, and instantly under reduced motion
// (the presets read it themselves: Motion's own config skips opacity).

/**
 * One screen at a time, cross-fading to the next when `screen` changes. The
 * outgoing and incoming screens stand in one grid cell, so nothing below
 * moves while they trade places. The first render does not fade: a page
 * rendered on the server shows at once.
 */
export function FadeSwap({
  children,
  screen,
}: Readonly<{ children: React.ReactNode; screen: string }>) {
  const { fadeIn } = useMotionPresets();
  return (
    <LazyMotion features={domMin} strict>
      <div className="grid">
        <AnimatePresence initial={false}>
          <m.div
            key={screen}
            initial={fadeIn.initial}
            animate={fadeIn.animate}
            exit={fadeIn.exit}
            className="col-start-1 row-start-1"
          >
            {children}
          </m.div>
        </AnimatePresence>
      </div>
    </LazyMotion>
  );
}

/**
 * A note or a block that fades in where it appears (rule 3), instantly under
 * reduced motion. It has no exit: a dialog's lines that go simply go. It lives
 * here, beside the other fades, so a lazy dialog needs no `m` of its own.
 */
export function FadeIn({
  as = "div",
  children,
  className,
  role,
}: Readonly<{
  as?: "div" | "p";
  children: React.ReactNode;
  className?: string;
  role?: "alert" | "status";
}>) {
  const { fadeIn } = useMotionPresets();
  const Tag = m[as];
  return (
    <LazyMotion features={domMin} strict>
      <Tag
        role={role}
        className={className}
        initial={fadeIn.initial}
        animate={fadeIn.animate}
        transition={fadeIn.transition}
      >
        {children}
      </Tag>
    </LazyMotion>
  );
}

// While its layer fades out, nothing in it takes a touch (inherited, so the
// layer's own buttons stop too); the box itself does not exist (`contents`).
function Leaving({ children }: Readonly<{ children: React.ReactNode }>) {
  const present = useIsPresent();
  return <div className={cn("contents", !present && "pointer-events-none")}>{children}</div>;
}

/**
 * A layer over the page that fades in when `show` turns true and out when it
 * turns false. Opacity only, never a transform: the layer holds a fixed
 * overlay, which a transform would turn into a box of its own. Once leaving,
 * it takes no touch.
 */
export function FadeLayer({
  children,
  show,
}: Readonly<{
  children: React.ReactNode;
  show: boolean;
}>) {
  const { fadeIn } = useMotionPresets();
  return (
    <LazyMotion features={domMin} strict>
      <AnimatePresence>
        {show && (
          <m.div
            key="layer"
            initial={fadeIn.initial}
            animate={fadeIn.animate}
            exit={fadeIn.exit}
            className="fixed inset-0 z-50"
          >
            <Leaving>{children}</Leaving>
          </m.div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}
