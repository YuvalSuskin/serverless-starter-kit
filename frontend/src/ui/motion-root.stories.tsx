import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { MotionConfig } from "motion/react";
import { expect } from "storybook/test";

import { cssRuleIn } from "../../tests/css-rules";
import { restoreRealReducedMotion, setReducedMotion } from "../../tests/reduced-motion";
import { useMotionPresets } from "../lib/motion";
import { MotionRoot } from "./motion-root";

const meta = {
  args: { children: null },
  component: MotionRoot,
  tags: ["mobile"],
} satisfies Meta<typeof MotionRoot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <MotionRoot>
      <div data-testid="motion-child">Content</div>
    </MotionRoot>
  ),
  play: async ({ canvasElement }) => {
    const child = canvasElement.querySelector('[data-testid="motion-child"]');
    await expect(child).toBeInTheDocument();
    await expect(child?.textContent).toBe("Content");
  },
};

export const TransitionUiReducedMotion: Story = {
  parameters: { motion: "real" }, // tests motion itself (.storybook/preview.tsx)
  render: () => (
    <div
      data-testid="transition-ui-box"
      className="rounded-card bg-grey-200 p-4 text-grey-900 transition-ui"
    >
      Transition
    </div>
  ),
  play: async () => {
    const rule = cssRuleIn(
      "prefers-reduced-motion: reduce",
      (selector) => selector === ".transition-ui",
    );
    await expect(rule).toBeDefined();
    await expect(rule?.style.transition).toMatch(/none/);
  },
};

export const TransitionFadeReducedMotion: Story = {
  parameters: { motion: "real" }, // tests motion itself (.storybook/preview.tsx)
  render: () => (
    <div
      data-testid="transition-fade-box"
      className="rounded-card bg-grey-200 p-4 text-grey-900 transition-fade"
    >
      Fade
    </div>
  ),
  play: async () => {
    const rule = cssRuleIn(
      "prefers-reduced-motion: reduce",
      (selector) => selector === ".transition-fade",
    );
    await expect(rule).toBeDefined();
    await expect(rule?.style.transition).toMatch(/none/);
  },
};

function FadeInCard() {
  const { fadeIn } = useMotionPresets();
  return (
    <div
      data-testid="fade-in-card"
      className="rounded-card bg-grey-200 p-4 text-grey-900"
      style={{ opacity: Number(fadeIn.initial.opacity) }}
    >
      Card
    </div>
  );
}

// Rule 3: under normal motion, fadeIn starts transparent (MotionConfig alone
// does not cover opacity -- this is the preset's own job).
export const FadeInPreset: Story = {
  parameters: { motion: "real" }, // tests motion itself (.storybook/preview.tsx)
  render: () => <FadeInCard />,
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector<HTMLElement>('[data-testid="fade-in-card"]');
    if (!card) throw new Error("Card not found");
    await expect(card).toBeInTheDocument();
    await expect(Number(getComputedStyle(card).opacity)).toBeCloseTo(0, 2);
  },
};

// Rule 3: under genuinely reduced motion, fadeIn.initial.opacity is 1 on
// the very first frame -- not just "the card exists" (storybook/test's
// automatic axe check already proves that part for free on every story).
export const FadeInPresetReducedMotion: Story = {
  parameters: { motion: "real" }, // tests motion itself (.storybook/preview.tsx)
  // setReducedMotion (tests/reduced-motion.tsx) stubs matchMedia and resets
  // Motion's one-time singleton synchronously, before render() returns --
  // the earlier FadeInPreset story above already mounted a Motion consumer
  // under normal motion, which freezes that singleton at false for the
  // rest of this page's life unless reset.
  render: () => {
    setReducedMotion(true);
    return (
      <MotionConfig reducedMotion="always">
        <FadeInCard />
      </MotionConfig>
    );
  },
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector<HTMLElement>('[data-testid="fade-in-card"]');
    if (!card) throw new Error("Card not mounted");
    await expect(Number(getComputedStyle(card).opacity)).toBeCloseTo(1, 2);

    // Restore before this story ends -- synchronous, so (unlike the CDP
    // revert this replaced) there is no async gap for the next story to race.
    restoreRealReducedMotion();
  },
};
