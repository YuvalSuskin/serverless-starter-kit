import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { useState } from "react";
import { expect, fn, userEvent, waitFor } from "storybook/test";

import { phoneSmallTapTargets } from "../../tests/tap-targets";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

// A few views of one thing, one at a time.
function Ways({
  disabled = false,
  onChange,
}: Readonly<{ disabled?: boolean; onChange: (value: string) => void }>) {
  const [value, setValue] = useState("rows");
  return (
    <Tabs
      className="max-w-xl"
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    >
      <TabsList aria-label="Ways to add names">
        <TabsTrigger value="rows">Typing</TabsTrigger>
        <TabsTrigger value="paste">Pasting a list</TabsTrigger>
        <TabsTrigger value="file" disabled={disabled}>
          From a spreadsheet
        </TabsTrigger>
      </TabsList>
      <TabsContent value="rows">Rows to type in</TabsContent>
      <TabsContent value="paste">A place to paste</TabsContent>
      <TabsContent value="file">Choosing a file</TabsContent>
    </Tabs>
  );
}

const meta = {
  args: { onChange: fn() },
  component: Ways,
  tags: ["mobile"],
} satisfies Meta<typeof Ways>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OpensByPress: Story = {
  play: async ({ args, canvas }) => {
    await expect(canvas.getByRole("tab", { name: "Typing" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.click(canvas.getByRole("tab", { name: "Pasting a list" }));
    await expect(args.onChange).toHaveBeenCalledWith("paste");
    await expect(canvas.getByRole("tabpanel")).toHaveTextContent("A place to paste");
  },
};

// Manual activation: an arrow moves the focus (to the next one, in the
// reading direction) without opening it; Enter opens it.
export const ArrowsMoveEnterOpens: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.tab();
    await expect(canvas.getByRole("tab", { name: "Typing" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(canvas.getByRole("tab", { name: "Pasting a list" })).toHaveFocus());
    await expect(args.onChange).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");
    await expect(args.onChange).toHaveBeenCalledWith("paste");
  },
};

export const DisabledTab: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("tab", { name: "From a spreadsheet" })).toBeDisabled();
  },
};

export const TapTargets: Story = {
  play: async () => {
    await expect(phoneSmallTapTargets()).toEqual([]);
  },
};
