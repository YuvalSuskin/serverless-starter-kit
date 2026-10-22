// Skeleton: the template's demo contact form story, replaced by bootstrap step 6.
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { contracts } from "@acme/contracts";
import { expect, userEvent } from "storybook/test";

import { json, stubFetch } from "../../../tests/story-fetch";
import { phoneSmallTapTargets } from "../../../tests/tap-targets";
import { ContactForm } from "./contact-form";

// The demo contact form. Stories answer the one route it calls, as the API
// does: a stored message, or the contract's 400 naming the empty field.
const SEND = /\/api\/public\/messages$/;

// Built through the contract's own output schema, so it cannot drift from it.
const stored = () =>
  json(
    contracts.public.sendMessage.output.parse({
      body: "Hello there.",
      createdAt: "2026-10-21T10:00:00.000Z",
      email: "ravit@example.test",
      id: "m1",
      name: "Ravit",
    }),
  );
const emptyBody = () =>
  json(
    {
      code: "invalid",
      correlationId: "c1",
      details: [{ issue: "too_small", path: "body.body" }],
    },
    400,
  );

const meta = {
  component: ContactForm,
  decorators: [
    (Render) => (
      <div className="max-w-md p-4">
        <Render />
      </div>
    ),
  ],
  tags: ["mobile"],
  title: "Contact/ContactForm",
} satisfies Meta<typeof ContactForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ideal: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Name")).toBeVisible();
    await expect(canvas.getByLabelText("Email")).toBeVisible();
    await expect(canvas.getByLabelText("Message")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Send message" })).toBeVisible();
  },
};

// The contract's refusal of an empty message is shown under the field, and
// what else was typed stays.
export const EmptyMessage: Story = {
  beforeEach: stubFetch([{ answer: emptyBody, method: "POST", path: SEND }]),
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("Name"), "Ravit");
    await userEvent.type(canvas.getByLabelText("Email"), "ravit@example.test");
    await userEvent.click(canvas.getByRole("button", { name: "Send message" }));
    await expect(await canvas.findByText("Message is required.")).toBeVisible();
    await expect(canvas.getByLabelText("Message")).toHaveAttribute("aria-invalid", "true");
    await expect(canvas.getByLabelText("Name")).toHaveValue("Ravit");
  },
};

export const Sent: Story = {
  beforeEach: stubFetch([{ answer: stored, method: "POST", path: SEND }]),
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("Name"), "Ravit");
    await userEvent.type(canvas.getByLabelText("Email"), "ravit@example.test");
    await userEvent.type(canvas.getByLabelText("Message"), "Hello there.");
    await userEvent.click(canvas.getByRole("button", { name: "Send message" }));
    await expect(await canvas.findByText("Thank you. Your message is sent.")).toBeVisible();
    await expect(canvas.getByLabelText("Message")).toHaveValue("");
  },
};

// A finger can press every field and the button.
export const TapTargets: Story = {
  play: async () => {
    await expect(phoneSmallTapTargets()).toEqual([]);
  },
};
