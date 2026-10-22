// Tap targets on a phone: everything a finger can press is at
// least 44 x 44 CSS px, the size iOS and Android guidance both give. The
// check is the page's own: it measures what is laid out, so a new button too
// small fails the journey that reaches it.

export interface SmallTarget {
  height: number;
  name: string;
  width: number;
}

/** What a finger presses: a link, button, field or anything with such a role. */
export const TAP_TARGET_MIN = 44;

/**
 * The visible things a finger can press that are under `min` px on a side.
 * Runs in the page and sends nothing out, so Playwright can run it with
 * `page.evaluate(smallTapTargets, options)` and a story's `play` can call it
 * directly. Self-contained, as Playwright's evaluate needs (frontend/CLAUDE.md).
 * `exempt` are selectors of things made small on purpose, each with its reason
 * at the call.
 */
export function smallTapTargets(options: { exempt: string[]; min: number }): SmallTarget[] {
  const pressable =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"]';
  const small: SmallTarget[] = [];
  for (const element of document.querySelectorAll(pressable)) {
    // Out of reach: inert, or kept for screen readers only.
    if (element.closest("[inert]") || element.closest(".sr-only")) continue;
    if (element.matches(".sr-only") || options.exempt.some((css) => element.closest(css))) continue;
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none") continue;
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    if (box.width >= options.min - 0.5 && box.height >= options.min - 0.5) continue;
    const label = element.getAttribute("aria-label") ?? element.textContent;
    small.push({
      height: Math.round(box.height),
      name: label.trim().slice(0, 40) || element.tagName.toLowerCase(),
      width: Math.round(box.width),
    });
  }
  return small;
}

/**
 * For a story's `play`, on the phone project only (no small ones are reported
 * elsewhere): a finger (pointer: coarse) is what the 44px rule is for, and the
 * same story on the computer project keeps the compact sizes a mouse gets.
 */
export function phoneSmallTapTargets(exempt: string[] = []): string[] {
  if (!globalThis.matchMedia("(pointer: coarse)").matches) return [];
  return smallTapTargets({ exempt, min: TAP_TARGET_MIN }).map(
    (one) => `${one.name} ${String(one.width)}x${String(one.height)}`,
  );
}
