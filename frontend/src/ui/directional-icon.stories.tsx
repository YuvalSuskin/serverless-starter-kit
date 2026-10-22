import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ArrowLeft } from "lucide-react";
import { expect } from "storybook/test";

import { DirectionalIcon } from "./directional-icon";

const meta = {
  component: DirectionalIcon,
  args: { icon: ArrowLeft },
} satisfies Meta<typeof DirectionalIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

function renderedIcon(root: HTMLElement): SVGSVGElement {
  const icon = root.querySelector("svg");
  if (!icon) throw new Error("DirectionalIcon rendered no <svg>");
  return icon;
}

// ArrowLeft points "forward" in an RTL reading order only once mirrored.
export const MirroredInRtl: Story = {
  parameters: { direction: "rtl" },
  play: async ({ canvasElement }) => {
    await expect(getComputedStyle(renderedIcon(canvasElement)).scale).toBe("-1 1");
  },
};

export const UnchangedInLtr: Story = {
  play: async ({ canvasElement }) => {
    await expect(getComputedStyle(renderedIcon(canvasElement)).scale).toBe("none");
  },
};
