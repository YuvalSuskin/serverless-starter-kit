import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { MotionConfig } from "motion/react";
import { useRef, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { MOTION } from "@/lib/motion";

import { restoreRealReducedMotion, setReducedMotion } from "../../tests/reduced-motion";
import { untilAllSettled } from "../../tests/story-motion";
import { Button } from "./button";
import { Dialog } from "./dialog";

const onOpenChange = fn<(open: boolean) => void>();
const next = fn();

// A step of work in a dialog: here, names pasted before they are checked. On phones too.
const meta = {
  component: Dialog,
  args: {
    actions: (
      <>
        <Button onClick={next}>Check the list</Button>
        <Button
          variant="ghost"
          onClick={() => {
            onOpenChange(false);
          }}
        >
          Cancel
        </Button>
      </>
    ),
    children: (
      <label className="flex flex-col gap-2">
        Names
        <textarea className="min-h-32 rounded-input border border-line p-3 text-100" />
      </label>
    ),
    onOpenChange,
    open: true,
    title: "New names for the list",
  },
  tags: ["mobile"],
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// The card (role="dialog", the visible surface) is a descendant of the
// native <dialog> (the mechanism: focus trap, top layer, Escape -- no
// visual presence of its own, display: contents). Most assertions below
// want the card; a few want the native element's own .open/.close().
function nativeDialogOf(content: HTMLElement): HTMLDialogElement {
  const dialog = content.closest("dialog");
  if (!dialog) throw new Error("Native <dialog> ancestor not found");
  return dialog;
}

export const Open: Story = {
  play: async () => {
    const body = within(document.body);
    const content = await body.findByRole("dialog", {
      name: "New names for the list",
    });
    const dialog = nativeDialogOf(content);
    await expect(dialog).toHaveAttribute("open");

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

    await userEvent.type(body.getByLabelText("Names"), "Ada Lovelace");
    await userEvent.click(body.getByRole("button", { name: "Check the list" }));
    await expect(next).toHaveBeenCalled();
    // Escape: the browser sends the dialog a cancel event.
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    await expect(onOpenChange).toHaveBeenCalledWith(false);
  },
};

// A full-screen dialog on a phone: the card is the whole viewport, with a header
// holding the title and a ✕, and the actions in a bar at the foot.
export const FullScreen: Story = {
  args: { closeLabel: "Close", fullScreen: true, title: "Item 3 of 40" },
  play: async () => {
    onOpenChange.mockClear();
    const body = within(document.body);
    const content = await body.findByRole("dialog", { name: "Item 3 of 40" });
    await waitFor(
      () => {
        if (Number(getComputedStyle(content).opacity) < 0.99) {
          throw new Error("enter transition not settled yet");
        }
      },
      { timeout: 500 },
    );
    const box = content.getBoundingClientRect();
    await expect([box.left, box.top]).toEqual([0, 0]);
    await expect(box.width).toBe(window.innerWidth);
    await expect(box.height).toBe(window.innerHeight);
    await expect(getComputedStyle(content).borderTopLeftRadius).toBe("0px");
    // The actions are in a bar at the foot, the ✕ closes.
    const action = body.getByRole("button", { name: "Check the list" });
    await expect(box.bottom - action.getBoundingClientRect().bottom).toBeLessThan(24);
    await userEvent.click(body.getByRole("button", { name: "Close" }));
    await expect(onOpenChange).toHaveBeenCalledWith(false);
  },
};

// While work is under way, Escape does not close it.
export const Busy: Story = {
  args: { busy: true },
  play: async () => {
    onOpenChange.mockClear();
    const body = within(document.body);
    const content = await body.findByRole("dialog", {
      name: "New names for the list",
    });
    const dialog = nativeDialogOf(content);

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

    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    await expect(onOpenChange).not.toHaveBeenCalled();
  },
};

function DialogHarness({
  initialOpen = false,
  title = "Dialog title",
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
        Open dialog
      </button>
      <Dialog
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
            Dismiss
          </Button>
        }
      >
        <p>Dialog content</p>
      </Dialog>
      {/* proves the rest of the page is interactive the
          instant closing starts, not once the exit animation finishes. */}
      <input type="text" data-testid="outside-input" aria-label="Another field on the page" />
    </div>
  );
}

// Rule 3: opening the dialog shows the inner content animating in.
export const Rule3OpeningEnter: Story = {
  parameters: { motion: "real" }, // tests motion itself (.storybook/preview.tsx)
  render: () => <DialogHarness initialOpen={false} title="Entry check" />,
  play: async ({ canvasElement }) => {
    const opener = canvasElement.querySelector<HTMLButtonElement>('[data-testid="opener-button"]');
    if (!opener) throw new Error("Opener button not found");

    opener.click();

    const body = within(document.body);
    const content = await body.findByRole("dialog", {
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
  render: () => <DialogHarness initialOpen={true} title="Exit check" />,
  play: async () => {
    const body = within(document.body);
    const content = await body.findByRole("dialog", {
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
  render: () => <DialogHarness initialOpen={true} title="Input check" />,
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const content = await body.findByRole("dialog", {
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

function ReducedMotionDialogHarness() {
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
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Quick dialog title"
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
      </Dialog>
    </div>
  );
}

// Rule 3: under reduced motion, both opening and closing resolve essentially immediately.
export const Rule3ReducedMotionInstant: Story = {
  parameters: { motion: "real" }, // tests motion itself (.storybook/preview.tsx)
  // setReducedMotion (tests/reduced-motion.tsx) stubs matchMedia and resets
  // Motion's one-time singleton synchronously, before render() returns --
  // only then does the harness (and the Dialog inside it, which calls
  // useReducedMotion() unconditionally) mount at all, so its very first
  // read is already the stubbed value.
  render: () => {
    setReducedMotion(true);
    return (
      <MotionConfig reducedMotion="always">
        <ReducedMotionDialogHarness />
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
    const content = await body.findByRole("dialog", {
      name: "Quick dialog title",
    });
    const dialog = nativeDialogOf(content);
    await expect(dialog).toHaveAttribute("open");

    // Under reduced motion the content is at full opacity on the very
    // first frame, well under MOTION.base (200ms) -- a strict bound, so
    // this fails if reduced motion were not actually honoured.
    await waitFor(
      () => {
        if (Number(getComputedStyle(content).opacity) < 0.99) {
          throw new Error("not instant");
        }
      },
      { timeout: 150 },
    );

    const closeButton = body.getByTestId("reduced-close-button");
    closeButton.click();

    // Closing settles (dialog.open false) well under MOTION.base too.
    await waitFor(
      () => {
        if (dialog.open) throw new Error("Dialog element not closed yet");
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
  render: () => <DialogHarness initialOpen={false} title="Focus check" />,
  play: async ({ canvasElement }) => {
    const opener = canvasElement.querySelector<HTMLButtonElement>('[data-testid="opener-button"]');
    if (!opener) throw new Error("Opener button not found");

    opener.focus();
    opener.click();

    const body = within(document.body);
    const content = await body.findByRole("dialog", {
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
    const content = await body.findByRole("dialog", {
      name: "New names for the list",
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

// A phone gives a dialog its own card, never the whole screen:
// a short body is centred and no taller than it needs, with the page showing
// above and below.
export const HugsItsContentCentred: Story = {
  play: async () => {
    const content = await within(document.body).findByRole("dialog", {
      name: "New names for the list",
    });
    const rect = content.getBoundingClientRect();
    await expect(rect.height).toBeLessThan(window.innerHeight * 0.6);
    await expect(Math.abs(rect.top - (window.innerHeight - rect.bottom))).toBeLessThanOrEqual(1);
    await expect(rect.left).toBeGreaterThanOrEqual(16);
    await expect(Math.abs(rect.left - (window.innerWidth - rect.right))).toBeLessThanOrEqual(1);
  },
};

// A long body keeps 1rem of the page all round and scrolls inside the card, so
// the card never touches the screen's edges (a notch or a home bar cannot hide
// its first line or its action).
export const TallContentKeepsAMargin: Story = {
  args: {
    children: Array.from({ length: 40 }, (_, n) => (
      <p key={n}>
        Line {n + 1} of a very long body, so that the card fills the screen and scrolls inside.
      </p>
    )),
  },
  play: async () => {
    const content = await within(document.body).findByRole("dialog", {
      name: "New names for the list",
    });
    const rect = content.getBoundingClientRect();
    await expect(rect.top).toBeGreaterThanOrEqual(16);
    await expect(window.innerHeight - rect.bottom).toBeGreaterThanOrEqual(16);
    await expect(content.scrollHeight).toBeGreaterThan(content.clientHeight);
  },
};

// A form's dialog never scrolls as a whole; only the region its body marks
// scrolls, and the actions stay in view.
export const FormScrollsOnlyItsRegion: Story = {
  args: {
    children: (
      <>
        <p>A line that stays on top.</p>
        {/* A region that scrolls takes the keyboard's focus, so it can be scrolled. */}
        <ul
          data-testid="region"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- see above
          tabIndex={0}
          aria-label="Names"
          className="min-h-0 overflow-y-auto"
        >
          {Array.from({ length: 60 }, (_, n) => (
            <li key={n}>Name {n + 1}</li>
          ))}
        </ul>
      </>
    ),
    layout: "form",
  },
  play: async () => {
    const content = await within(document.body).findByRole("dialog", {
      name: "New names for the list",
    });
    await expect(content.scrollHeight).toBeLessThanOrEqual(content.clientHeight + 1);
    const region = within(content).getByTestId("region");
    await expect(region.scrollHeight).toBeGreaterThan(region.clientHeight);
    const action = within(content).getByRole("button", { name: "Cancel" });
    await expect(action.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      content.getBoundingClientRect().bottom,
    );
  },
};

function WithInitialFocus() {
  const field = useRef<HTMLInputElement>(null);
  return (
    <Dialog open onOpenChange={onOpenChange} title="New names for the list" initialFocus={field}>
      <Button variant="outline">First button</Button>
      <label className="flex flex-col gap-2">
        Name
        <input ref={field} className="min-h-11 rounded-input border border-line px-3 text-100" />
      </label>
    </Dialog>
  );
}

// The field named takes the focus once the dialog opens, not
// the first button.
export const InitialFocus: Story = {
  render: () => <WithInitialFocus />,
  play: async () => {
    const field = await within(document.body).findByRole("textbox", { name: "Name" });
    await waitFor(() => expect(field).toHaveFocus());
  },
};
