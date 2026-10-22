import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, waitFor } from "storybook/test";

import { restoreRealReducedMotion, setReducedMotion } from "../../tests/reduced-motion";
import { untilAllSettled } from "../../tests/story-motion";
import { FadeIn, FadeLayer, FadeSwap } from "./fade";

// Fundamentals Task 28, rule 3: states and overlays change with a short
// cross-fade, and instantly under reduced motion.
const meta = { component: FadeSwap, tags: ["mobile"], title: "UI/Fade" } satisfies Meta<
  typeof FadeSwap
>;
export default meta;
type Story = StoryObj<typeof meta>;

function Swapper() {
  const [at, setAt] = useState(0);
  const screens = ["Loading", "Opened"] as const;
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          // Flushed in the click itself, so a story reads the cross-fade's
          // first frame without waiting on a clock.
          flushSync(() => {
            setAt((was) => 1 - was);
          });
        }}
      >
        Swap
      </button>
      <FadeSwap screen={screens[at] ?? ""}>
        <p data-testid="screen">{screens[at]}</p>
      </FadeSwap>
    </div>
  );
}

const screensOf = (canvasElement: HTMLElement) => [
  ...canvasElement.querySelectorAll<HTMLElement>('[data-testid="screen"]'),
];
const opacityOf = (element: Element | null | undefined) =>
  Number(getComputedStyle(element ?? document.body).opacity);

// Rule 3: a change of state cross-fades: the old screen is still there,
// fading, as the new one comes in. Both are read in the same task as the
// click, so no clock decides the result.
export const StatusSwapCrossFades: Story = {
  parameters: { motion: "real" },
  args: { children: null, screen: "" },
  render: () => <Swapper />,
  play: async ({ canvas, canvasElement }) => {
    canvas.getByRole("button", { name: "Swap" }).click();
    const both = screensOf(canvasElement);
    await expect(both).toHaveLength(2);
    await expect(opacityOf(both[1]?.parentElement)).toBeLessThan(1);
    await waitFor(async () => {
      await expect(screensOf(canvasElement)).toHaveLength(1);
    });
    const [only] = screensOf(canvasElement);
    await expect(only).toHaveTextContent("Opened");
    await expect(opacityOf(only?.parentElement)).toBe(1);
    await untilAllSettled();
  },
};

// Rule 3: under reduced motion the new screen is whole at once.
export const StatusSwapInstantWhenReduced: Story = {
  parameters: { motion: "real" },
  args: { children: null, screen: "" },
  render: () => {
    setReducedMotion(true);
    return <Swapper />;
  },
  play: async ({ canvas, canvasElement }) => {
    try {
      canvas.getByRole("button", { name: "Swap" }).click();
      const incoming = screensOf(canvasElement).find((el) => el.textContent === "Opened");
      await expect(opacityOf(incoming?.parentElement)).toBe(1);
      await waitFor(async () => {
        await expect(screensOf(canvasElement)).toHaveLength(1);
      });
    } finally {
      restoreRealReducedMotion();
    }
    await untilAllSettled();
  },
};

function Layered() {
  const [show, setShow] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          flushSync(() => {
            setShow((was) => !was);
          });
        }}
      >
        Layer
      </button>
      <FadeLayer show={show}>
        <p data-testid="layer">Layer open</p>
      </FadeLayer>
    </div>
  );
}

// Rule 3: the overlay enters and leaves; leaving, it takes no touch.
export const OverlayEntersAndLeaves: Story = {
  parameters: { motion: "real" },
  args: { children: null, screen: "" },
  render: () => <Layered />,
  play: async ({ canvas, canvasElement }) => {
    const layer = () => canvasElement.querySelector<HTMLElement>('[data-testid="layer"]');
    const box = () => layer()?.closest(".fixed");
    canvas.getByRole("button", { name: "Layer" }).click();
    await expect(opacityOf(box())).toBeLessThan(1);
    await waitFor(async () => {
      await expect(opacityOf(box())).toBe(1);
    });
    canvas.getByRole("button", { name: "Layer" }).click();
    // Still there, fading out, and no longer touchable.
    await expect(layer()).not.toBeNull();
    await expect(getComputedStyle(layer() ?? document.body).pointerEvents).toBe("none");
    await waitFor(async () => {
      await expect(layer()).toBeNull();
    });
    await untilAllSettled();
  },
};

// A note that fades in where it appears (a dialog's lines): it starts below full
// opacity, and under reduced motion it is simply there.
export const NoteFadesIn: Story = {
  parameters: { motion: "real" },
  args: { children: null, screen: "" },
  render: () => (
    <FadeIn as="p" role="status">
      The date has changed since you set it.
    </FadeIn>
  ),
  play: async ({ canvas }) => {
    const note = await canvas.findByRole("status");
    await waitFor(() => {
      if (Number(getComputedStyle(note).opacity) < 0.99) throw new Error("still fading");
    });
    await expect(note).toHaveTextContent("The date has changed");
    await untilAllSettled();
  },
};

export const NoteIsThereAtOnceWhenReduced: Story = {
  parameters: { motion: "real" },
  args: { children: null, screen: "" },
  render: () => {
    setReducedMotion(true);
    return (
      <FadeIn as="p" role="status">
        The date has changed since you set it.
      </FadeIn>
    );
  },
  play: async ({ canvas }) => {
    try {
      const note = await canvas.findByRole("status");
      await expect(Number(getComputedStyle(note).opacity)).toBeGreaterThanOrEqual(0.99);
    } finally {
      restoreRealReducedMotion();
    }
    await untilAllSettled();
  },
};
