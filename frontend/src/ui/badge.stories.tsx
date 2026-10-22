import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { expect } from "storybook/test";

import { Badge, BadgeIndicator } from "./badge";

// A word that names a state, such as an event's: the word
// carries the meaning, the outline only echoes it.
const meta = {
  component: Badge,
  tags: ["mobile"],
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Solid: Story = {
  args: {
    children: (
      <>
        <BadgeIndicator />
        Open
      </>
    ),
  },
  play: async ({ canvasElement }) => {
    const badge = canvasElement.querySelector('[data-slot="badge"]');
    await expect(badge).toHaveTextContent("Open");
    await expect(badge?.className).not.toContain("border-dashed");
    // The dot is a picture: a screen reader hears the word alone.
    await expect(canvasElement.querySelector('[data-slot="badge-indicator"]')).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  },
};

export const Dashed: Story = {
  args: {
    children: (
      <>
        <BadgeIndicator />
        Draft
      </>
    ),
    variant: "dashed",
  },
  play: async ({ canvasElement }) => {
    const badge = canvasElement.querySelector('[data-slot="badge"]');
    await expect(badge).toHaveTextContent("Draft");
    await expect(badge?.className).toContain("border-dashed");
  },
};

export const WordOnly: Story = {
  args: { children: "Closed" },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-slot="badge-indicator"]')).toBeNull();
  },
};
