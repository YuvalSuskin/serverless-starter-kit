import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { expect, fn, userEvent, within } from "storybook/test";

import { Menu } from "./menu";

// The hand-built menu: never clipped by the scrolling
// region it sits in, and a plain button with a list of ways.
const meta = { title: "UI/Menu" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const select = fn();
const WAYS = [
  { label: "Move earlier", onSelect: select },
  { label: "Move later", onSelect: select },
  { label: "Remove", onSelect: select },
] as const;

export const OpensDownwardWithRoomBelow: Story = {
  render: () => (
    <div className="h-72 overflow-y-auto rounded-card border border-line p-2">
      <Menu label="More" items={WAYS} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "More" }));
    await expect(await canvas.findByRole("menu")).toHaveAttribute("data-placement", "below");
  },
};

// The panel would run past the region's bottom edge, so it opens upward and
// stays inside the region.
export const OpensUpwardNearTheRegionsBottom: Story = {
  render: () => (
    <div className="h-72 overflow-y-auto rounded-card border border-line p-2">
      <div className="h-52" />
      <Menu label="More" items={WAYS} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const region = canvasElement.querySelector<HTMLElement>(".overflow-y-auto");
    await userEvent.click(canvas.getByRole("button", { name: "More" }));
    const menu = await canvas.findByRole("menu");
    await expect(menu).toHaveAttribute("data-placement", "above");
    await expect(menu.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      region?.getBoundingClientRect().top ?? 0,
    );
  },
};

// A press away closes it; choosing a way closes it and does that way.
export const ClosesOnAPressAwayAndOnChoosing: Story = {
  render: () => (
    <div className="p-2">
      <Menu label="More" items={WAYS} />
      <button type="button">Outside the menu</button>
    </div>
  ),
  play: async ({ canvasElement }) => {
    select.mockClear();
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "More" }));
    await userEvent.click(canvas.getByRole("button", { name: "Outside the menu" }));
    await expect(canvas.queryByRole("menu")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "More" }));
    await userEvent.click(await canvas.findByRole("menuitem", { name: "Move later" }));
    await expect(select).toHaveBeenCalledTimes(1);
    await expect(canvas.queryByRole("menu")).toBeNull();
    await expect(canvas.getByRole("button", { name: "More" })).toHaveFocus();
  },
};

// A way set apart from the others (withdrawing).
export const AWaySetApart: Story = {
  render: () => (
    <Menu
      label="More"
      items={[
        { label: "Make a copy", onSelect: select },
        { apart: true, label: "Leave this list", onSelect: select },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "More" }));
    const items = await canvas.findAllByRole("menuitem");
    await expect(items.map((item) => item.textContent)).toEqual(["Make a copy", "Leave this list"]);
    await expect(items[0]).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect(items[1]).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expect(canvas.getByRole("button", { name: "More" })).toHaveFocus();
  },
};
