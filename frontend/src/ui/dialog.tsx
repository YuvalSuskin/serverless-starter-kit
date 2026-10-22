"use client";

import { AnimatePresence, domMin, LazyMotion, m } from "motion/react";
import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from "react";

import { useMotionPresets } from "@/lib/motion";
import { cn } from "@/lib/utils";

import styles from "./dialog-backdrop.module.css";

// A dialog for a step of work that is not a yes-or-no question: adding
// names to a list and checking them before they are added.
// The native <dialog>, as in ConfirmDialog: showModal() gives the
// focus trap, the top layer and Escape, with no library. Escape and the
// caller's own way out close it through `onOpenChange`; while `busy`,
// nothing closes it, so work under way cannot be left half seen. Wider than
// a confirmation; a long part of its body scrolls in its own region.
//
// Animation strategy (North Star Part 2.1 rule 3, and "motion must never
// cost input"): the native <dialog> releases its modal state
// -- and with it the rest of the page's inertness -- the INSTANT closing
// starts, by calling close() synchronously rather than waiting for the
// exit transition to finish. A click or keystroke elsewhere on the page
// right after "add" or "save" must land immediately, not after a ~200ms
// animation the person may not even be watching. The backdrop and card
// below are real Motion-animated elements (not the native ::backdrop,
// which Motion cannot ref and which disappears the instant close() runs)
// with their own fixed positioning, so they keep fading out purely
// visually -- with pointer-events disabled -- for as long as the exit
// transition takes, entirely independent of the dialog's already-closed,
// already-non-modal state. The <dialog> itself is `display: contents`
// (dialog-backdrop.module.css) precisely so its own open/closed state
// never affects whether its children keep rendering.
export function Dialog({
  actions,
  busy = false,
  children,
  closeLabel = "Close",
  fullScreen = false,
  initialFocus,
  layout = "flow",
  onOpenChange,
  open,
  title,
  wide = false,
}: Readonly<{
  /** The ways on and out, main one first. */
  actions?: ReactNode;
  busy?: boolean;
  children: ReactNode;
  /** The ✕ of a full-screen dialog, for a screen reader. */
  closeLabel?: string;
  /**
   * The card fills the viewport, with no frame (one image, say): a header
   * with the title and a ✕, the body taking the room, the actions in a bar.
   * "phone": only below lg; from lg up it is the usual centred card, with the
   * same header, body (which scrolls in its own region) and bar.
   */
  fullScreen?: boolean | "phone";
  /** What takes the focus once the dialog opens (React's autoFocus fires before showModal() and is lost). */
  initialFocus?: RefObject<HTMLElement | null>;
  /**
   * "form": the card never scrolls as a whole; its body is a flex column
   * that ends at the card's foot, so a part of it marked `min-h-0
   * overflow-y-auto` scrolls in its own region while the rest stays in
   * view. "flow": the card scrolls when it must.
   */
  layout?: "flow" | "form";
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
  /** For a step that shows an image at size (the cover's framing). */
  wide?: boolean;
}>) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [showContent, setShowContent] = useState(open);
  const { fadeIn, rise } = useMotionPresets();

  let cardClass = "dialog-card";
  if (fullScreen === "phone") cardClass = "dialog-card-phone";
  else if (fullScreen) cardClass = "dialog-card-full";
  else if (wide) cardClass = "dialog-card-wide";
  // A form's card: a column whose body ends at its foot; the
  // card's own scrolling never starts, since its body shrinks to fit.
  else if (layout === "form") cardClass = "dialog-card flex flex-col";

  if (open && !showContent) {
    setShowContent(true);
  }

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open) {
      if (!element.open) {
        element.showModal();
        initialFocus?.current?.focus();
      }
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
  }, [initialFocus, open]);

  return (
    <LazyMotion features={domMin} strict>
      <dialog
        ref={dialog}
        // No role or aria-labelledby here: display: contents (below) means
        // this element has no visual presence of its own (a real browser,
        // and Playwright's own visibility check, correctly call it
        // invisible), so it must not be the thing screen readers or tests
        // address as "the dialog" -- that is the card m.div's role and
        // aria-labelledby, below. This element is purely the mechanism:
        // focus trap, top layer and Escape, native, no library.
        data-closing={!showContent}
        onCancel={(event) => {
          event.preventDefault();
          if (!busy) onOpenChange(false);
        }}
        className={styles.dialog}
      >
        <AnimatePresence>
          {showContent && (
            <>
              <m.div
                key="backdrop"
                // open, not showContent: this is the LAST render before the
                // card/backdrop start exiting (this whole block is gated on
                // showContent, which is about to flip false), so open --
                // already false by then -- is what correctly bakes
                // pointer-events-none into the exiting snapshot Motion
                // keeps animating after that.
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
                role="dialog"
                aria-labelledby={titleId}
                aria-busy={busy}
                className={cn(cardClass, !open && "pointer-events-none")}
                initial={rise.initial}
                animate={rise.animate}
                exit={rise.exit}
                transition={rise.transition}
              >
                {fullScreen ? (
                  <>
                    <div className="flex shrink-0 items-center justify-between gap-3 border-be border-line px-4 py-1">
                      <h2 id={titleId} className="text-200 leading-tight font-semibold">
                        {title}
                      </h2>
                      <button
                        type="button"
                        aria-label={closeLabel}
                        disabled={busy}
                        onClick={() => {
                          onOpenChange(false);
                        }}
                        className="grid size-11 place-items-center rounded-pill transition-ui outline-none hover:bg-soft focus-visible:ring-3 focus-visible:ring-ring"
                      >
                        <svg
                          aria-hidden
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          className="size-5"
                        >
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div
                      className={cn(
                        "flex min-h-0 flex-1 flex-col text-100",
                        fullScreen === "phone" && "overflow-y-auto",
                      )}
                    >
                      {children}
                    </div>
                    {actions !== undefined && (
                      <div className="flex shrink-0 flex-wrap items-center gap-3 border-bs border-line px-4 py-2">
                        {actions}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <h2 id={titleId} className="text-300 leading-tight font-semibold">
                      {title}
                    </h2>
                    <div
                      className={cn(
                        "mt-4 flex flex-col gap-4 text-100",
                        layout === "form" && "min-h-0 flex-1",
                      )}
                    >
                      {children}
                    </div>
                    {actions !== undefined && (
                      <div className="mt-6 flex shrink-0 flex-wrap gap-3">{actions}</div>
                    )}
                  </>
                )}
              </m.div>
            </>
          )}
        </AnimatePresence>
      </dialog>
    </LazyMotion>
  );
}
