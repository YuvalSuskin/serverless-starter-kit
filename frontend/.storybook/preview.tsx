import type { Preview } from "@storybook/nextjs-vite";

import { MotionConfig } from "motion/react";

import "../src/app/fonts";
import { DIRECTION, LOCALE } from "../src/lib/locale";
import "../src/app/globals.css";
import { setReducedMotion } from "../tests/reduced-motion";
import { STORY_VIEWPORTS } from "./viewports";

// Stories run settled by default: motion finishes instantly, so the a11y
// check that follows play() never reads a half-faded, semi-transparent
// element (axe's colour-contrast reports one as a violation, intermittently
// and more often on a slow runner). Three layers, all off together:
// Motion's own useReducedMotion() (the matchMedia stub, tests/reduced-motion),
// MotionConfig for transform and layout, and CSS transitions and animations
// (a style rule: the media query itself cannot be stubbed). A story or file
// that tests motion itself opts back in with `parameters: { motion: "real" }`.
const SETTLED_CSS = `*, *::before, *::after {
  animation-delay: 0s !important;
  animation-duration: 0s !important;
  animation-iteration-count: 1 !important;
  transition-delay: 0s !important;
  transition-duration: 0s !important;
}`;

// A story that tests motion itself must see the same thing on any host. The
// browser's own `prefers-reduced-motion` drives the CSS `motion-reduce:`
// rules and the `transition-*` utilities, and no script can stub a media
// query: under Vitest, every test page's browser context reports no
// preference (vitest.config.ts), so such a story sees motion on. It was
// emulated per story over the DevTools protocol: a round trip through the
// test runner, twice a story, that took up to 6 s in a full run on a quiet
// machine, and these stories were the ones timing out at 30 s on a busy one.
// In Storybook's own UI the host's setting stands.
const preview: Preview = {
  parameters: {
    // An axe violation fails the story's test instead of showing a warning.
    a11y: { test: "error" },
    viewport: { options: STORY_VIEWPORTS },
  },
  decorators: [
    // Every story renders the way the app does: the app locale and direction
    // (@/lib/locale), the bundled font.
    // A story can opt into the other direction with `parameters: { direction: "rtl" }`.
    (Story, { parameters }) => {
      const real = parameters.motion === "real";
      const asked: unknown = parameters.direction;
      const direction = asked === "rtl" || asked === "ltr" ? asked : DIRECTION;
      // Before the story renders, so before anything using Motion mounts.
      // A real-motion story forces reduced motion OFF, as the settled default
      // forces it on, so it behaves the same on any host.
      setReducedMotion(!real);
      return (
        <MotionConfig reducedMotion={real ? "user" : "always"}>
          {real ? null : <style>{SETTLED_CSS}</style>}
          <div dir={direction} lang={LOCALE} className="font-sans">
            <Story />
          </div>
        </MotionConfig>
      );
    },
  ],
};

export default preview;
