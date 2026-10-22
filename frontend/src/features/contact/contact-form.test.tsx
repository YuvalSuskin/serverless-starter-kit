// Skeleton: test of the template's demo contact form, replaced by bootstrap step 6.
import { contracts } from "@acme/contracts";
import { http, HttpResponse } from "msw";
import { setupWorker } from "msw/browser";
import { expect, screen, userEvent } from "storybook/test";
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from "vitest";
import { render } from "vitest-browser-react";

import { ContactForm } from "./contact-form";

// The API as the contract defines it: the mock parses the body with the real
// input schema and refuses it the way the backend does (400 `invalid`, with
// the issue codes and paths of define-route.ts), so what the form shows for
// an empty body is the contract's own refusal and not a copy of it.
let received = 0;
const worker = setupWorker();
const api = () =>
  http.post(`*${contracts.public.sendMessage.path}`, async ({ request }) => {
    received += 1;
    const parsed = contracts.public.sendMessage.input.body.safeParse(await request.json());
    if (!parsed.success) {
      return HttpResponse.json(
        {
          code: "invalid",
          correlationId: "c1",
          details: parsed.error.issues.map((issue) => ({
            issue: issue.code,
            path: ["body", ...issue.path.map(String)].join("."),
          })),
        },
        { status: 400 },
      );
    }
    return HttpResponse.json(
      contracts.public.sendMessage.output.parse({
        ...parsed.data,
        createdAt: "2026-10-21T10:00:00.000Z",
        id: "m1",
      }),
    );
  });

beforeAll(async () => {
  await worker.start({ onUnhandledRequest: "error", quiet: true });
});
beforeEach(() => {
  received = 0;
  worker.use(api());
});
afterEach(() => {
  worker.resetHandlers();
});
afterAll(() => {
  worker.stop();
});

// The form is driven in the page (Testing Library's user-event, as the stories
// do) rather than through the runner's locators: each locator call is a round
// trip to the test runner, and a loaded machine made a test of ten of them
// run out of time.
const send = () => userEvent.click(screen.getByRole("button", { name: "Send message" }));
const fillAll = async (message: string) => {
  await userEvent.type(screen.getByLabelText("Name"), "Ravit");
  await userEvent.type(screen.getByLabelText("Email"), "ravit@example.test");
  if (message) await userEvent.type(screen.getByLabelText("Message"), message);
};

describe("ContactForm", () => {
  it("shows the contract's refusal under the message when the body is empty, and keeps the rest", async () => {
    await render(<ContactForm />);
    await fillAll("");
    await send();

    await expect(await screen.findByText("Message is required.")).toBeVisible();
    await expect(screen.getByLabelText("Message")).toHaveAttribute("aria-invalid", "true");
    await expect(screen.getByLabelText("Message")).toHaveAccessibleDescription(
      "Message is required.",
    );
    // Only the empty field is refused, and what was typed stays.
    await expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-invalid");
    await expect(screen.getByLabelText("Name")).toHaveValue("Ravit");
    await expect(screen.getByLabelText("Email")).toHaveValue("ravit@example.test");
    await expect(screen.queryByText("Thank you. Your message is sent.")).toBeNull();
  });

  it("refuses every empty field, and an address that is not one", async () => {
    await render(<ContactForm />);
    await send();
    await expect(await screen.findByText("Name is required.")).toBeVisible();
    // An empty address is not an address: the contract's email check says so.
    await expect(screen.getByText("Email is not valid.")).toBeVisible();
    await expect(screen.getByText("Message is required.")).toBeVisible();

    await userEvent.type(screen.getByLabelText("Name"), "Ravit");
    await userEvent.type(screen.getByLabelText("Email"), "not-an-address");
    await userEvent.type(screen.getByLabelText("Message"), "Hello");
    await send();
    await expect(await screen.findByText("Email is not valid.")).toBeVisible();
    await expect(screen.queryByText("Name is required.")).toBeNull();
    await expect(screen.queryByText("Message is required.")).toBeNull();
  });

  it("sends a valid message once, says thanks and empties the fields", async () => {
    await render(<ContactForm />);
    await fillAll("Hello there.");
    await send();

    const thanks = await screen.findByText("Thank you. Your message is sent.");
    await expect(thanks).toHaveAttribute("role", "status");
    await expect(screen.getByLabelText("Message")).toHaveValue("");
    await expect(received).toBe(1);
  });

  it("says the message was not sent, and keeps it, when the API fails", async () => {
    worker.use(
      http.post(`*${contracts.public.sendMessage.path}`, () =>
        HttpResponse.json({ code: "internal", correlationId: "c2" }, { status: 500 }),
      ),
    );
    await render(<ContactForm />);
    await fillAll("Hello there.");
    await send();

    await expect(await screen.findByRole("alert")).toHaveTextContent("could not send");
    await expect(screen.getByLabelText("Message")).toHaveValue("Hello there.");
  });
});
