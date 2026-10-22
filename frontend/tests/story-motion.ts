// For stories that test motion itself (`parameters: { motion: "real" }`).

import { waitFor } from "storybook/test";

// Every Motion fade (inline opacity) and every running CSS transition or
// animation under `root` is done: a state the page owns, not a clock. Call it
// as the last step of a `motion: "real"` story, so the a11y check that follows
// never reads a half-transparent element (axe reports one as a colour-contrast
// failure).
export async function untilAllSettled(root: HTMLElement = document.body) {
  await waitFor(() => {
    for (const node of root.querySelectorAll<HTMLElement>("*")) {
      if (node.style.opacity !== "" && Number(node.style.opacity) < 0.99) {
        throw new Error("still fading");
      }
    }
    // A loop that never ends (a pulse, the gradient) is ambient, not a change in progress.
    const running = root
      .getAnimations({ subtree: true })
      .some(
        (a) =>
          a.playState === "running" &&
          a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY,
      );
    if (running) {
      throw new Error("still animating");
    }
  });
}
