"use client";

import { AnimatePresence, domMin, LazyMotion, m } from "motion/react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { useMotionPresets } from "@/lib/motion";
import { cn } from "@/lib/utils";

import styles from "./dialog-backdrop.module.css";

// A question the person answers before something they cannot take back
// (publishing, deleting, leaving unsaved changes). The native
// <dialog>: showModal() gives the
// focus trap, the top layer and Escape for free, with no library in any
// page's bundle. Escape answers "no", as the dialog's own
// way out does. The buttons are the caller's, so each dialog names its own
// actions (copy.md: buttons say what happens). A soft card on a dimmed page.
//
// Animation strategy (North Star Part 2.1 rule 3, and "motion must never
// cost input"): see dialog.tsx's longer comment -- the
// native <dialog> releases its modal state, and with it the rest of the
// page's inertness, the instant closing starts (close() called
// synchronously, not deferred to the exit transition's end). The backdrop
// and card are real Motion-animated elements, not the native ::backdrop,
// kept alive purely visually by AnimatePresence for as long as their own
// exit takes, independent of the dialog's already-closed state.
export function ConfirmDialog({
  actions,
  children,
  onOpenChange,
  open,
  title,
}: Readonly<{
  /** The ways out, main one first: each a Button. */
  actions: ReactNode;
  /** What the action does, in plain sentences. */
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
}>) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const [showContent, setShowContent] = useState(open);
  const { fadeIn, rise } = useMotionPresets();

  if (open && !showContent) {
    setShowContent(true);
  }

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open) {
      if (!element.open) element.showModal();
    } else {
      // Release the modal state (and the rest of the page's inertness)
      // at once, not once the exit animation finishes: see the comment
      // above. The card and backdrop's own exit keeps playing visually,
      // driven by showContent below, independently of this.
      if (element.open) element.close();
      queueMicrotask(() => {
        setShowContent(false);
      });
    }
  }, [open]);

  return (
    <LazyMotion features={domMin} strict>
      <dialog
        ref={dialog}
        // No role, aria-labelledby or aria-describedby here: display:
        // contents (below) means this element has no visual presence of
        // its own (a real browser, and Playwright's own visibility check,
        // correctly call it invisible), so it must not be the thing screen
        // readers or tests address as "the dialog" -- that is the card
        // m.div's role and aria-* below. This element is purely the
        // mechanism: focus trap, top layer and Escape, native, no library.
        data-closing={!showContent}
        onCancel={(event) => {
          // Escape: the dialog stays in React's hands, closed by its state.
          event.preventDefault();
          onOpenChange(false);
        }}
        className={styles.dialog}
      >
        <AnimatePresence>
          {showContent && (
            <>
              <m.div
                key="backdrop"
                // open, not showContent: see dialog.tsx's identical comment.
                className={cn("fixed inset-0 bg-grey-900/40", !open && "pointer-events-none")}
                initial={fadeIn.initial}
                animate={fadeIn.animate}
                exit={fadeIn.exit}
                transition={fadeIn.transition}
              />
              {/* The card itself: the dialog element above has no box of
                  its own (display: contents), so the card's own fade-and-rise,
                  centred and fixed-positioned here, is what the person
                  actually sees moving (not just its text). */}
              <m.div
                key="card"
                data-slot="dialog-content"
                role="alertdialog"
                aria-labelledby={titleId}
                aria-describedby={bodyId}
                className={cn("dialog-card-sm", !open && "pointer-events-none")}
                initial={rise.initial}
                animate={rise.animate}
                exit={rise.exit}
                transition={rise.transition}
              >
                <h2 id={titleId} className="text-200 leading-tight font-semibold">
                  {title}
                </h2>
                <div
                  id={bodyId}
                  className="mt-3 flex flex-col gap-2 text-100 text-muted-foreground"
                >
                  {children}
                </div>
                <div className="mt-6 flex flex-wrap gap-3">{actions}</div>
              </m.div>
            </>
          )}
        </AnimatePresence>
      </dialog>
    </LazyMotion>
  );
}
