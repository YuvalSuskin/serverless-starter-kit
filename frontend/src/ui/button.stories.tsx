import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { expect, fn } from "storybook/test";

import { expectSameBox } from "@/lib/geometry";
import { tap } from "@/lib/gestures";
import { MOTION } from "@/lib/motion";

import { cssRuleIn } from "../../tests/css-rules";
import { untilAllSettled } from "../../tests/story-motion";
import { Button } from "./button";

// People tap buttons on phones: `mobile` runs these stories on the phone
// profile too (storybook-mobile), as well as on desktop.
const meta = {
  component: Button,
  args: { children: "Save", onClick: fn() },
  tags: ["mobile"],
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

export const Tapped: Story = {
  play: async ({ args, canvas }) => {
    await tap(canvas.getByRole("button", { name: "Save" }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

export const Secondary: Story = { args: { variant: "secondary" } };
export const Outline: Story = { args: { variant: "outline" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const Destructive: Story = { args: { variant: "destructive", children: "Delete" } };
export const Link: Story = { args: { variant: "link" } };

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
  },
};

export const IsAPill: Story = {
  play: async ({ canvas }) => {
    const radius = getComputedStyle(canvas.getByRole("button")).borderTopLeftRadius;
    // --r-pill is 999px: the brand token reached the rendered component.
    await expect(radius).toBe("999px");
  },
};

// Rule 3: hover transitions colour only (not all properties), at MOTION.base duration,
// and under reduced motion no transition runs.
export const TransitionsGently: Story = {
  parameters: { motion: "real" }, // tests motion itself (.storybook/preview.tsx)
  play: async ({ canvasElement }) => {
    const button = canvasElement.querySelector<HTMLButtonElement>("button");
    if (!button) throw new Error("Button not found");

    await expect(button.classList.contains("transition-ui")).toBe(true);

    const computed = getComputedStyle(button);
    const properties = computed.transitionProperty.split(",").map((p) => p.trim());
    const allowed = new Set(["color", "background-color", "border-color", "box-shadow", "opacity"]);
    for (const prop of properties) {
      await expect(allowed.has(prop)).toBe(true);
    }
    await expect(properties).not.toContain("all");

    // All transition durations match MOTION.base (0.2s)
    const durations = computed.transitionDuration.split(",").map((d) => parseFloat(d.trim()));
    for (const duration of durations) {
      await expect(duration).toBeCloseTo(MOTION.base, 2);
    }

    // Under prefers-reduced-motion: reduce, transition-ui removes transitions
    const rule = cssRuleIn(
      "(prefers-reduced-motion: reduce)",
      (selector) => selector === ".transition-ui",
    );
    if (!rule) throw new Error("missing reduced-motion rule for .transition-ui");
    await expect(rule.style.transition).toBe("none");
    await untilAllSettled();
  },
};

export const Pending: Story = {
  args: { pending: true },
};

// Rule 1: pending keeps the button's width and height (expectSameBox) with the same label text.
export const PendingGeometryMatch: Story = {
  render: () => (
    <div className="grid">
      <div className="col-start-1 row-start-1">
        <Button pending={false}>Save</Button>
      </div>
      <div className="col-start-1 row-start-1">
        <Button pending={true}>Save</Button>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const buttons = canvasElement.querySelectorAll<HTMLButtonElement>("button");
    const normal = buttons[0];
    const pending = buttons[1];
    if (!normal || !pending) throw new Error("Buttons not found");

    expectSameBox(normal, pending);
    await expect(normal.textContent).toBe("Save");
    await expect(pending.textContent).toBe("Save");

    // Not natively disabled: focus and full opacity stay (only aria-disabled
    // marks it, and the click handler is the thing actually guarded).
    await expect(pending).toHaveAttribute("aria-busy", "true");
    await expect(pending).toHaveAttribute("aria-disabled", "true");
    await expect(pending).not.toBeDisabled();

    const spinner = pending.querySelector("svg");
    if (!spinner) throw new Error("Missing spinner in pending button");
    await expect(spinner).toHaveAttribute("aria-hidden", "true");
    await expect(spinner.classList.contains("animate-spin")).toBe(true);
    await expect(spinner.classList.contains("motion-reduce:animate-none")).toBe(true);

    // The spinner never overlaps the label (rule 1's "same label" means
    // visually unobstructed, not just the same textContent string).
    const textNode = Array.from(pending.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE,
    );
    if (!textNode) throw new Error("No label text node found");
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const textRect = range.getBoundingClientRect();
    const spinnerRect = spinner.getBoundingClientRect();
    const noOverlap = spinnerRect.right <= textRect.left || spinnerRect.left >= textRect.right;
    await expect(noOverlap).toBe(true);
  },
};

// Rule 1: pending guards the click (no double-submit) while staying focusable.
export const PendingGuardsClick: Story = {
  args: { pending: true },
  play: async ({ args, canvas }) => {
    const button = canvas.getByRole("button", { name: "Save" });
    button.focus();
    await expect(document.activeElement).toBe(button);

    button.click();
    await expect(args.onClick).not.toHaveBeenCalled();
    // Focus never moved (a native `disabled` button would have blurred to <body>).
    await expect(document.activeElement).toBe(button);
  },
};

export const AsChildPending: Story = {
  render: () => (
    <Button asChild pending={true}>
      <a href="/somewhere">Link</a>
    </Button>
  ),
  play: async ({ canvasElement }) => {
    const link = canvasElement.querySelector<HTMLAnchorElement>("a");
    if (!link) throw new Error("Link not found");

    await expect(link).toHaveAttribute("aria-busy", "true");
    await expect(link).toHaveAttribute("aria-disabled", "true");
    await expect(link).not.toHaveAttribute("disabled");
    await expect(link.textContent).toBe("Link");

    const spinner = link.querySelector("svg");
    if (!spinner) throw new Error("Missing spinner in asChild pending button");
    await expect(spinner).toHaveAttribute("aria-hidden", "true");
  },
};
