// Touch gestures for tests: a finger's events,
// dispatched on an element. Vitest tests and story play functions call them
// directly; Playwright passes one to `locator.evaluate(swipe, options)`, which
// sends the function's source into the page. That is why each function is
// self-contained and repeats the same "finger" block: one that called a
// module-level function would throw ReferenceError in the page.
//
// Like Playwright's own tap, each helper first scrolls the target into view,
// then checks that a finger could touch its centre: a target that is hidden,
// or covered by another element, is an error, not a silent pass.
//
// The events are synthetic (isTrusted is false). They reach JavaScript
// handlers, Motion's gestures included, but the browser itself ignores them:
// they scroll nothing, open no native menu and select no text. Test
// scroll-snap by scrolling (see frontend/CLAUDE.md, "Phones and touch").
//
// Test code only: lint rejects an import of this module from product code.

export type SwipeDirection = "left" | "right" | "up" | "down";

// Types are erased before Playwright serializes a helper, so sharing one is safe.
type FingerPhase = "down" | "move" | "up";

/** A finger taps the target's centre: touch pointer and touch events, then a click. */
export async function tap(target: Element): Promise<void> {
  // The finger: the same block in every helper (see the top of the file).
  target.scrollIntoView({ block: "nearest", inline: "nearest" });
  const box = target.getBoundingClientRect();
  const x0 = box.left + box.width / 2;
  const y0 = box.top + box.height / 2;
  const hit = box.width > 0 && box.height > 0 ? document.elementFromPoint(x0, y0) : null;
  if (!hit || !target.contains(hit)) {
    throw new Error(
      "tap: a finger cannot touch the target's centre: it is not visible, or something covers it",
    );
  }
  const id = 2; // 1 is the mouse; one finger at a time
  const webkit = document as Document & {
    createTouch?: (...args: [Window, EventTarget, number, number, number, number, number]) => Touch;
    createTouchList?: (...touches: Touch[]) => TouchList;
  };
  const fire = (phase: FingerPhase, x: number, y: number) => {
    const init = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y };
    target.dispatchEvent(
      new PointerEvent(`pointer${phase}`, {
        ...init,
        pointerId: id,
        pointerType: "touch",
        isPrimary: true,
        button: phase === "move" ? -1 : 0,
        buttons: phase === "up" ? 0 : 1,
        pressure: phase === "up" ? 0 : 0.5,
      }),
    );
    if (typeof Touch !== "function") return;
    // WebKit has no Touch constructor: it builds touches and lists on document.
    const touch = webkit.createTouch
      ? webkit.createTouch(window, target, id, x + window.scrollX, y + window.scrollY, x, y)
      : new Touch({ identifier: id, target, clientX: x, clientY: y });
    const list = (touches: Touch[]) => (webkit.createTouchList?.(...touches) ?? touches) as Touch[];
    const held = list(phase === "up" ? [] : [touch]);
    target.dispatchEvent(
      new TouchEvent({ down: "touchstart", move: "touchmove", up: "touchend" }[phase], {
        ...init,
        touches: held,
        targetTouches: held,
        changedTouches: list([touch]),
      }),
    );
  };
  fire("down", x0, y0);
  await new Promise((resolve) => setTimeout(resolve, 50));
  fire("up", x0, y0);
  // A disabled control gets the finger's pointer events but never a click.
  if (target.matches(":disabled")) return;
  const init = { bubbles: true, cancelable: true, composed: true, clientX: x0, clientY: y0 };
  target.dispatchEvent(new MouseEvent("mousedown", { ...init, buttons: 1 }));
  target.dispatchEvent(new MouseEvent("mouseup", init));
  target.dispatchEvent(new PointerEvent("click", { ...init, pointerId: id, pointerType: "touch" }));
}

/** A finger presses the target's centre and holds it (default 600ms, past iOS's and Chrome's threshold). No click. */
export async function longPress(
  target: Element,
  { duration = 600 }: { duration?: number } = {},
): Promise<void> {
  // The finger: the same block in every helper (see the top of the file).
  target.scrollIntoView({ block: "nearest", inline: "nearest" });
  const box = target.getBoundingClientRect();
  const x0 = box.left + box.width / 2;
  const y0 = box.top + box.height / 2;
  const hit = box.width > 0 && box.height > 0 ? document.elementFromPoint(x0, y0) : null;
  if (!hit || !target.contains(hit)) {
    throw new Error(
      "longPress: a finger cannot touch the target's centre: it is not visible, or something covers it",
    );
  }
  const id = 2; // 1 is the mouse; one finger at a time
  const webkit = document as Document & {
    createTouch?: (...args: [Window, EventTarget, number, number, number, number, number]) => Touch;
    createTouchList?: (...touches: Touch[]) => TouchList;
  };
  // eslint-disable-next-line sonarjs/no-identical-functions -- same as tap's on purpose: Playwright serializes each helper alone, so it cannot share one
  const fire = (phase: FingerPhase, x: number, y: number) => {
    const init = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y };
    target.dispatchEvent(
      new PointerEvent(`pointer${phase}`, {
        ...init,
        pointerId: id,
        pointerType: "touch",
        isPrimary: true,
        button: phase === "move" ? -1 : 0,
        buttons: phase === "up" ? 0 : 1,
        pressure: phase === "up" ? 0 : 0.5,
      }),
    );
    if (typeof Touch !== "function") return;
    // WebKit has no Touch constructor: it builds touches and lists on document.
    const touch = webkit.createTouch
      ? webkit.createTouch(window, target, id, x + window.scrollX, y + window.scrollY, x, y)
      : new Touch({ identifier: id, target, clientX: x, clientY: y });
    const list = (touches: Touch[]) => (webkit.createTouchList?.(...touches) ?? touches) as Touch[];
    const held = list(phase === "up" ? [] : [touch]);
    target.dispatchEvent(
      new TouchEvent({ down: "touchstart", move: "touchmove", up: "touchend" }[phase], {
        ...init,
        touches: held,
        targetTouches: held,
        changedTouches: list([touch]),
      }),
    );
  };
  fire("down", x0, y0);
  await new Promise((resolve) => setTimeout(resolve, duration));
  fire("up", x0, y0);
}

/**
 * A finger drags from the target's centre, `distance` px (default 200) in a
 * physical direction, over `duration` ms (default 160). In RTL the next item
 * of a horizontal list is to the left, so revealing it is a swipe "right".
 */
export async function swipe(
  target: Element,
  {
    direction,
    distance = 200,
    duration = 160,
  }: { direction: SwipeDirection; distance?: number; duration?: number },
): Promise<void> {
  // The finger: the same block in every helper (see the top of the file).
  target.scrollIntoView({ block: "nearest", inline: "nearest" });
  const box = target.getBoundingClientRect();
  const x0 = box.left + box.width / 2;
  const y0 = box.top + box.height / 2;
  const hit = box.width > 0 && box.height > 0 ? document.elementFromPoint(x0, y0) : null;
  if (!hit || !target.contains(hit)) {
    throw new Error(
      "swipe: a finger cannot touch the target's centre: it is not visible, or something covers it",
    );
  }
  const id = 2; // 1 is the mouse; one finger at a time
  const webkit = document as Document & {
    createTouch?: (...args: [Window, EventTarget, number, number, number, number, number]) => Touch;
    createTouchList?: (...touches: Touch[]) => TouchList;
  };
  // eslint-disable-next-line sonarjs/no-identical-functions -- same as tap's on purpose: Playwright serializes each helper alone, so it cannot share one
  const fire = (phase: FingerPhase, x: number, y: number) => {
    const init = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y };
    target.dispatchEvent(
      new PointerEvent(`pointer${phase}`, {
        ...init,
        pointerId: id,
        pointerType: "touch",
        isPrimary: true,
        button: phase === "move" ? -1 : 0,
        buttons: phase === "up" ? 0 : 1,
        pressure: phase === "up" ? 0 : 0.5,
      }),
    );
    if (typeof Touch !== "function") return;
    // WebKit has no Touch constructor: it builds touches and lists on document.
    const touch = webkit.createTouch
      ? webkit.createTouch(window, target, id, x + window.scrollX, y + window.scrollY, x, y)
      : new Touch({ identifier: id, target, clientX: x, clientY: y });
    const list = (touches: Touch[]) => (webkit.createTouchList?.(...touches) ?? touches) as Touch[];
    const held = list(phase === "up" ? [] : [touch]);
    target.dispatchEvent(
      new TouchEvent({ down: "touchstart", move: "touchmove", up: "touchend" }[phase], {
        ...init,
        touches: held,
        targetTouches: held,
        changedTouches: list([touch]),
      }),
    );
  };
  const vectors: Record<SwipeDirection, [number, number]> = {
    left: [-1, 0],
    right: [1, 0],
    up: [0, -1],
    down: [0, 1],
  };
  const [ux, uy] = vectors[direction];
  const steps = 8;
  fire("down", x0, y0);
  for (let step = 1; step < steps; step++) {
    await new Promise((resolve) => setTimeout(resolve, duration / steps));
    fire("move", x0 + (ux * distance * step) / steps, y0 + (uy * distance * step) / steps);
  }
  await new Promise((resolve) => setTimeout(resolve, duration / steps));
  fire("move", x0 + ux * distance, y0 + uy * distance);
  fire("up", x0 + ux * distance, y0 + uy * distance);
}
