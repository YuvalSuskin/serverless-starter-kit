import { hasReducedMotionListener } from "motion-dom";

// Motion's useReducedMotion() (motion-dom's initPrefersReducedMotion) reads
// window.matchMedia("(prefers-reduced-motion)").matches ONCE -- the first
// time ANY component on this page calls it -- into a module-level ref, via
// a React useState(prefersReducedMotion.current) LAZY initializer, not a
// live subscription. Two consequences:
//
// 1. Stubbing window.matchMedia BEFORE that first read (rather than
//    emulating the real media feature at the browser engine over CDP, which
//    needs an async round trip -- flaky under this machine's full-suite
//    load) makes that first read return whatever this stub
//    says, synchronously, with no network/process hop at all.
// 2. Once any OTHER component on this page has already called
//    useReducedMotion() with the real (non-reduced) value, the singleton is
//    frozen there; stubbing matchMedia afterwards has nothing left to
//    affect. hasReducedMotionListener.current = false clears the "already
//    initialised" flag so the NEXT useReducedMotion() call re-reads (the
//    now-stubbed) matchMedia from scratch.
let realMatchMedia: typeof window.matchMedia | undefined;

function stubMatchMedia(reduce: boolean): void {
  realMatchMedia ??= window.matchMedia.bind(window);
  const fallback = realMatchMedia;
  window.matchMedia = (query: string): MediaQueryList => {
    if (!query.includes("prefers-reduced-motion")) return fallback(query);
    return {
      addEventListener: () => undefined,
      addListener: () => undefined,
      dispatchEvent: () => false,
      matches: reduce,
      media: query,
      onchange: null,
      removeEventListener: () => undefined,
      removeListener: () => undefined,
    } as MediaQueryList;
  };
}

/**
 * Makes the NEXT `useReducedMotion()` call (motion-dom's lazy, one-time
 * matchMedia read) see `reduce`. Call this at the top of a story's
 * `render()`, before anything using Motion mounts: `render()` runs
 * synchronously, before React commits, so there is no async gap for a
 * concurrent story to race (unlike the CDP emulation this replaced).
 */
export function setReducedMotion(reduce: boolean): void {
  stubMatchMedia(reduce);
  hasReducedMotionListener.current = false;
}

/**
 * Restores the real matchMedia and clears Motion's singleton, so the next
 * story's own first `useReducedMotion()` call sees this test browser's real
 * (non-reduced) preference again, same as if this story had never run. Call
 * this as the LAST step of any `play()` whose `render()` called
 * `setReducedMotion` -- synchronous, so (unlike the CDP revert this
 * replaced) there is no unawaited cleanup for a later story to race.
 */
export function restoreRealReducedMotion(): void {
  if (realMatchMedia) window.matchMedia = realMatchMedia;
  hasReducedMotionListener.current = false;
}
