import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { MotionConfig } from "motion/react";
import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { MOTION } from "@/lib/motion";

import { restoreRealReducedMotion, setReducedMotion } from "../../tests/reduced-motion";
import { untilAllSettled } from "../../tests/story-motion";
import { Button } from "./button";
import { ConfirmDialog } from "./confirm-dialog";

const confirm = fn();
const onOpenChange = fn<(open: boolean) => void>();

// A confirmation before something that cannot be taken back. Phones too.
const meta = {
  component: ConfirmDialog,
  args: {
    actions: (
      <>
        <Button onClick={confirm}>Publish</Button>
        <Button
          variant="ghost"
          onClick={() => {
            onOpenChange(false);
          }}
        >
          Back to the event
        </Button>
      </>
    ),
    children: <p>Once published, the link opens the event.</p>,
    onOpenChange,
    open: true,
    title: "Publish the event?",
  },
  tags: ["mobile"],
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// The card (role="alertdialog", the visible surface) is a descendant of
// the native <dialog> (the mechanism: focus trap, top layer, Escape -- no
// visual presence of its own, display: contents). Most assertions below
// want the card; a few want the native element's own .open/.close().
function nativeDialogOf(content: HTMLElement): HTMLDialogElement {
  const dialog = content.closest("dialog");
  if (!dialog) throw new Error("Native <dialog> ancestor not found");
  return dialog;
}

export const Open: Story = {
  play: async () => {
    // A modal dialog in the top layer, named by its title and described by its body.
    const body = within(document.body);
    const content = await body.findByRole("alertdialog", {
      name: "Publish the event?",
    });
    const dialog = nativeDialogOf(content);
    await expect(dialog).toHaveAttribute("open");
    await expect(content).toHaveAccessibleDescription("Once published, the link opens the event.");

    // Let the enter animation settle before the automatic axe check reads
    // the DOM: mid-fade text is semi-transparent, which axe's colour-contrast
    // rule reports as a (temporary, not real) violation.
    await waitFor(
      () => {
        if (Number(getComputedStyle(content).opacity) < 0.99) {
          throw new Error("enter transition not settled yet");
        }
      },
      { timeout: 500 },
    );

    await userEvent.click(body.getByRole("button", { name: "Publish" }));
    await expect(confirm).toHaveBeenCalled();
    await userEvent.click(body.getByRole("button", { name: "Back to the event" }));
    await expect(onOpenChange).toHaveBeenCalledWith(false);
  },
};

function ConfirmDialogHarness({
  initialOpen = false,
  title = "Confirm action",
}: Readonly<{
  initialOpen?: boolean;
  title?: string;
}>) {
  const [open, setOpen] = useState(initialOpen);

  return (
    <div className="p-4">
      <button
        type="button"
        data-testid="opener-button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Open confirmation
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        actions={
          <Button
            type="button"
            data-testid="close-button"
            onClick={() => {
              setOpen(false);
            }}
          >
            Cancel
          </Button>
        }
      >
        <p>Are you sure?</p>
      </ConfirmDialog>
      {/* proves the rest of the page is interactive the
          instant closing starts, not once the exit animation finishes. */}
      <input type="text" data-testid="outside-input" aria-label="Another field on the page" />
    </div>
  );
}

// Rule 3: opening the dialog shows the inner content animating in.
export const Rule3OpeningEnter: Story = {
  parameters: { motion: "real" }, // tests motion itself (.storybook/preview.tsx)
  render: () => <ConfirmDialogHarness initialOpen={false} title="Entry check" />,
  play: async ({ canvasElement }) => {
    const opener = canvasElement.querySelector<HTMLButtonElement>('[data-testid="opener-button"]');
    if (!opener) throw new Error("Opener button not found");

    opener.click();

    const body = within(document.body);
    const content = await body.findByRole("alertdialog", {
      name: "Entry check",
    });
    const dialog = nativeDialogOf(content);
    await expect(dialog).toHaveAttribute("open");

    // Poll for the inner content's opacity reaching 1 -- all the way, not
    // just "most of the way": the automatic axe check right after play()
    // reads the DOM in whatever state it is in, and mid-fade, semi-transparent
    // text intermittently (not always) trips its colour-contrast rule.
    await waitFor(() => {
      const opacity = Number(getComputedStyle(content).opacity);
      if (opacity < 0.99) {
        throw new Error(`Opacity not yet settled: ${String(opacity)}`);
      }
    });
    await untilAllSettled();
  },
};

// "Motion must never cost input": the native <dialog> --
// and the rest of the page's inertness with it -- releases essentially at
// once, not once the exit animation finishes. Rule 3: the card itself
// still plays its own exit animation in full, entirely independent of
// the dialog's already-closed state.
export const Rule3ClosingWaitsForLeave: Story = {
  parameters: { motion: "real" }, // tests motion itself (.storybook/preview.tsx)
  render: () => <ConfirmDialogHarness initialOpen={true} title="Exit check" />,
  play: async () => {
    const body = within(document.body);
    const content = await body.findByRole("alertdialog", {
      name: "Exit check",
    });
    const dialog = nativeDialogOf(content);
    await expect(dialog).toHaveAttribute("open");

    const closeButton = body.getByTestId("close-button");
    closeButton.click();

    // The native <dialog> closes essentially at once -- well under
    // MOTION.base (200ms), a strict bound -- not once the card's own
    // exit animation finishes below.
    await waitFor(
      () => {
        if (dialog.open) {
          throw new Error("Dialog element still open");
        }
      },
      { timeout: 100 },
    );

    // But the card is still in the DOM right then, mid-exit...
    await expect(dialog.querySelector('[data-slot="dialog-content"]')).not.toBeNull();

    // ...and only actually gone once its own transition has run its course.
    await waitFor(
      () => {
        if (dialog.querySelector('[data-slot="dialog-content"]')) {
          throw new Error("Card still in the DOM");
        }
      },
      { timeout: (MOTION.base + 0.3) * 1000 },
    );
    await untilAllSettled();
  },
};

// "Motion must never cost input": a click or keystroke
// elsewhere on the page right after closing must land at once -- not be
// silently dropped for as long as the card is still visually fading out.
export const Rule3ClosingDoesNotBlockInput: Story = {
  parameters: { motion: "real" }, // tests motion itself (.storybook/preview.tsx)
  render: () => <ConfirmDialogHarness initialOpen={true} title="Input check" />,
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const content = await body.findByRole("alertdialog", {
      name: "Input check",
    });
    const dialog = nativeDialogOf(content);
    await expect(content).toBeInTheDocument();

    const closeButton = body.getByTestId("close-button");
    closeButton.click();

    // No wait at all: type into the rest of the page immediately, exactly
    // as a fast click or keystroke right after "add" or "save" would.
    const outside = canvasElement.querySelector<HTMLInputElement>('[data-testid="outside-input"]');
    if (!outside) throw new Error("Outside input not found");
    await userEvent.type(outside, "hello");
    await expect(outside).toHaveValue("hello");

    // Only end once the card's own exit animation has actually finished --
    // not while the automatic axe check right after play() might still read
    // the still-exiting, semi-transparent card's text as a (temporary, not
    // real) colour-contrast violation.
    await waitFor(
      () => {
        if (dialog.querySelector('[data-slot="dialog-content"]')) {
          throw new Error("Card still in the DOM");
        }
      },
      { timeout: (MOTION.base + 0.3) * 1000 },
    );
    await untilAllSettled();
  },
};

function ReducedMotionConfirmDialogHarness() {
  const [open, setOpen] = useState(false);

  return (
    <div className="p-4">
      <button
        type="button"
        data-testid="reduced-opener-button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Open
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Quick confirmation title"
        actions={
          <Button
            type="button"
            data-testid="reduced-close-button"
            onClick={() => {
              setOpen(false);
            }}
          >
            Dismiss
          </Button>
        }
      >
        <p>Quick content</p>
      </ConfirmDialog>
    </div>
  );
}

// Rule 3: under reduced motion, both opening and closing resolve essentially immediately.
export const Rule3ReducedMotionInstant: Story = {
  parameters: { motion: "real" }, // tests motion itself (.storybook/preview.tsx)
  // setReducedMotion (tests/reduced-motion.tsx) stubs matchMedia and resets
  // Motion's one-time singleton synchronously, before render() returns --
  // only then does the harness (and the ConfirmDialog inside it, which
  // calls useReducedMotion() unconditionally) mount at all, so its very
  // first read is already the stubbed value.
  render: () => {
    setReducedMotion(true);
    return (
      <MotionConfig reducedMotion="always">
        <ReducedMotionConfirmDialogHarness />
      </MotionConfig>
    );
  },
  play: async ({ canvasElement }) => {
    const opener = canvasElement.querySelector<HTMLButtonElement>(
      '[data-testid="reduced-opener-button"]',
    );
    if (!opener) throw new Error("Opener button not found");

    opener.click();

    const body = within(document.body);
    const content = await body.findByRole("alertdialog", {
      name: "Quick confirmation title",
    });
    const dialog = nativeDialogOf(content);
    await expect(dialog).toHaveAttribute("open");

    // Under reduced motion the content is at full opacity on the very
    // first frame, well under MOTION.base (200ms) -- a strict bound, so
    // this fails if reduced motion were not actually honoured.
    await waitFor(
      () => {
        const opacity = Number(getComputedStyle(content).opacity);
        if (opacity < 0.99) {
          throw new Error(`Opacity not instant: ${String(opacity)}`);
        }
      },
      { timeout: 150 },
    );

    const closeButton = body.getByTestId("reduced-close-button");
    closeButton.click();

    // Closing settles (dialog.open false) well under MOTION.base too.
    await waitFor(
      () => {
        if (dialog.open) {
          throw new Error("Dialog element not closed yet");
        }
      },
      { timeout: 150 },
    );
    await expect(dialog.open).toBe(false);

    // Restore before this story ends -- synchronous, so (unlike the CDP
    // revert this replaced) there is no async gap for the next story to race.
    restoreRealReducedMotion();
    await untilAllSettled();
  },
};

// Focus returns to the opener element once .close() has actually run.
export const FocusReturnsToOpener: Story = {
  render: () => <ConfirmDialogHarness initialOpen={false} title="Focus check" />,
  play: async ({ canvasElement }) => {
    const opener = canvasElement.querySelector<HTMLButtonElement>('[data-testid="opener-button"]');
    if (!opener) throw new Error("Opener button not found");

    opener.focus();
    opener.click();

    const body = within(document.body);
    const content = await body.findByRole("alertdialog", {
      name: "Focus check",
    });
    const dialog = nativeDialogOf(content);
    await expect(dialog).toHaveAttribute("open");

    const closeButton = body.getByTestId("close-button");
    closeButton.click();

    // Poll for the dialog's native .open === false first
    await waitFor(
      () => {
        if (dialog.open) {
          throw new Error("Dialog element still open");
        }
      },
      { timeout: (MOTION.base + 0.3) * 1000 },
    );
    await expect(dialog.open).toBe(false);

    // THEN check document.activeElement is back on that button
    await expect(document.activeElement).toBe(opener);

    // Only end once the card's own exit animation has actually finished --
    // not while the automatic axe check right after play() might still read
    // the still-exiting, semi-transparent card's text as a (temporary, not
    // real) colour-contrast violation.
    await waitFor(
      () => {
        if (dialog.querySelector('[data-slot="dialog-content"]')) {
          throw new Error("Card still in the DOM");
        }
      },
      { timeout: (MOTION.base + 0.3) * 1000 },
    );
  },
};

// Mobile: dialog fits at 412px.
export const MobileFits: Story = {
  play: async () => {
    const body = within(document.body);
    const content = await body.findByRole("alertdialog", {
      name: "Publish the event?",
    });
    // Let the enter animation settle first: mid-fade, opacity is still 0,
    // which toBeVisible() correctly calls not visible yet.
    await waitFor(() => {
      if (Number(getComputedStyle(content).opacity) < 0.99) {
        throw new Error("enter transition not settled yet");
      }
    });
    await expect(content).toBeVisible();
    const rect = content.getBoundingClientRect();
    await expect(rect.width).toBeLessThanOrEqual(window.innerWidth);
  },
};

// A phone gives a confirmation its own card, centred and no taller than its
// words and buttons, never the whole screen.
export const HugsItsContentCentred: Story = {
  play: async () => {
    const content = await within(document.body).findByRole("alertdialog", {
      name: "Publish the event?",
    });
    const rect = content.getBoundingClientRect();
    await expect(rect.height).toBeLessThan(window.innerHeight * 0.6);
    await expect(Math.abs(rect.top - (window.innerHeight - rect.bottom))).toBeLessThanOrEqual(1);
    await expect(rect.left).toBeGreaterThanOrEqual(16);
    await expect(Math.abs(rect.left - (window.innerWidth - rect.right))).toBeLessThanOrEqual(1);
  },
};
