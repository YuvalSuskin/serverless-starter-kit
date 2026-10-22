import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { longPress, swipe, type SwipeDirection, tap } from "./gestures";

// Runs in the browser-mobile project: Chromium emulating the Pixel 7.
afterEach(() => {
  document.body.replaceChildren();
});

// A 200x200 target in the page, recording every pointer and touch event it
// receives: type, pointerType, position and time.
function target(attributes: Record<string, string> = {}) {
  const container = document.createElement("div");
  container.dir = attributes.dir ?? "ltr";
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = "target";
  element.style.cssText = "display:block;width:200px;height:200px;touch-action:none";
  if (attributes.disabled) element.disabled = true;
  if (attributes.hidden) element.style.display = "none";
  if (attributes.invisible) element.style.visibility = "hidden";
  if (attributes.below) container.style.marginTop = "3000px";
  container.append(element);
  document.body.append(container);

  const events: { type: string; pointerType: string; x: number; y: number; time: number }[] = [];
  for (const type of [
    "pointerdown",
    "pointermove",
    "pointerup",
    "touchstart",
    "touchmove",
    "touchend",
    "click",
  ]) {
    element.addEventListener(type, (event) => {
      const pointer = event instanceof PointerEvent ? event : undefined;
      events.push({
        type,
        pointerType: pointer?.pointerType ?? "",
        x: pointer?.clientX ?? 0,
        y: pointer?.clientY ?? 0,
        time: event.timeStamp,
      });
    });
  }
  const onClick = vi.fn();
  element.addEventListener("click", onClick);
  const types = () => events.map((event) => event.type);
  const first = (type: string) => events.find((event) => event.type === type);
  return { element, events, first, onClick, types };
}

describe("the phone profile", () => {
  it("is a touch phone 412px wide", () => {
    expect(window.innerWidth).toBe(412);
    expect(navigator.maxTouchPoints).toBeGreaterThan(0);
    expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  });
});

describe("tap", () => {
  it("clicks the target once, with a touch pointer and touch events", async () => {
    const { element, events, onClick, types } = target();
    await tap(element);
    expect(onClick).toHaveBeenCalledOnce();
    expect(types()).toEqual(expect.arrayContaining(["touchstart", "touchend"]));
    const pointers = events.filter((event) => event.type.startsWith("pointer"));
    expect(pointers.map((event) => event.pointerType)).toEqual(["touch", "touch"]);
  });

  it("does nothing to a disabled button, as a finger would", async () => {
    const { element, onClick } = target({ disabled: "true" });
    await tap(element);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("longPress", () => {
  it("holds the pointer down for the duration, then releases without a click", async () => {
    const { element, first, onClick } = target();
    await longPress(element, { duration: 300 });
    const held = (first("pointerup")?.time ?? 0) - (first("pointerdown")?.time ?? 0);
    expect(held).toBeGreaterThanOrEqual(300);
    expect(first("touchstart")).toBeDefined();
    expect(first("touchend")).toBeDefined();
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("swipe", () => {
  const moves: [SwipeDirection, number, number][] = [
    ["left", -120, 0],
    ["right", 120, 0],
    ["up", 0, -120],
    ["down", 0, 120],
  ];

  it.each(moves)("%s moves the pointer by the distance on that axis", async (direction, dx, dy) => {
    const { element, events, first } = target();
    await swipe(element, { direction, distance: 120 });
    const down = first("pointerdown");
    const up = events.findLast((event) => event.type === "pointerup");
    expect((up?.x ?? 0) - (down?.x ?? 0)).toBe(dx);
    expect((up?.y ?? 0) - (down?.y ?? 0)).toBe(dy);
    expect(events.filter((event) => event.type === "pointermove").length).toBeGreaterThan(2);
    expect(events.filter((event) => event.type === "touchmove").length).toBeGreaterThan(2);
    expect(
      events.every((event) => !event.type.startsWith("pointer") || event.pointerType === "touch"),
    ).toBe(true);
  });

  it("is physical: right is rightwards on screen in RTL too", async () => {
    const { element, events, first } = target({ dir: "rtl" });
    await swipe(element, { direction: "right", distance: 80 });
    const up = events.findLast((event) => event.type === "pointerup");
    expect((up?.x ?? 0) - (first("pointerdown")?.x ?? 0)).toBe(80);
  });

  it("fires no click", async () => {
    const { element, onClick } = target();
    await swipe(element, { direction: "left" });
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("a target a finger cannot reach", () => {
  it.each([
    ["tap", (element: Element) => tap(element)],
    ["longPress", (element: Element) => longPress(element, { duration: 10 })],
    ["swipe", (element: Element) => swipe(element, { direction: "left" })],
  ] as const)("%s rejects instead of dispatching into nothing", async (_name, gesture) => {
    const { element, events } = target({ hidden: "true" });
    await expect(gesture(element)).rejects.toThrow(/not visible/);
    expect(events).toEqual([]);
  });
});

describe("a target a finger cannot reach at its centre", () => {
  const gestures = [
    ["tap", (element: Element) => tap(element)],
    ["longPress", (element: Element) => longPress(element, { duration: 10 })],
    ["swipe", (element: Element) => swipe(element, { direction: "left" })],
  ] as const;

  it.each(gestures)("%s rejects a visibility: hidden target", async (_name, gesture) => {
    const { element, events } = target({ invisible: "true" });
    await expect(gesture(element)).rejects.toThrow(/cannot touch/);
    expect(events).toEqual([]);
  });

  it.each(gestures)("%s rejects a target covered by another element", async (_name, gesture) => {
    const { element, events } = target();
    const cover = document.createElement("div");
    cover.style.cssText = "position:fixed;inset:0;background:white";
    document.body.append(cover);
    await expect(gesture(element)).rejects.toThrow(/cannot touch/);
    expect(events).toEqual([]);
  });

  it("scrolls a target below the fold into view first, as Playwright's tap does", async () => {
    const { element, onClick } = target({ below: "true" });
    await tap(element);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

// WebKit (the iPhone e2e project) has no Touch constructor: it exposes Touch,
// but builds touches with document.createTouch and lists with
// document.createTouchList, as Playwright's own dispatchEvent does. Chromium
// is given that shape here, since WebKit cannot run on every machine.
describe("on an engine shaped like WebKit", () => {
  const RealTouch = Touch;
  const created: number[] = [];

  beforeEach(() => {
    created.length = 0;
    vi.stubGlobal("Touch", function IllegalConstructor() {
      throw new TypeError("Illegal constructor");
    });
    Object.assign(document, {
      createTouch: (
        _view: Window,
        touchTarget: EventTarget,
        identifier: number,
        pageX: number,
        pageY: number,
      ) => {
        created.push(identifier);
        return new RealTouch({
          identifier,
          target: touchTarget,
          clientX: pageX - window.scrollX,
          clientY: pageY - window.scrollY,
        });
      },
      createTouchList: (...touches: Touch[]) => touches,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, "createTouch");
    Reflect.deleteProperty(document, "createTouchList");
  });

  it.each([
    ["tap", (element: Element) => tap(element), "touchend"],
    ["longPress", (element: Element) => longPress(element, { duration: 10 }), "touchend"],
    ["swipe", (element: Element) => swipe(element, { direction: "left" }), "touchmove"],
  ] as const)("%s builds its touches with document.createTouch", async (_name, gesture, type) => {
    const { element, types } = target();
    await gesture(element);
    expect(created.length).toBeGreaterThan(0);
    expect(types()).toContain(type);
  });
});
