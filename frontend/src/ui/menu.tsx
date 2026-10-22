"use client";

import { MoreHorizontal } from "lucide-react";
import {
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";

// A menu of ways, built by hand: a
// `relative` box, a button with `aria-haspopup="menu"` and `aria-expanded`,
// and the panel beside it, not in a portal (a popover library is not worth
// the bundle). On opening it measures the room below inside the scrolling
// region and opens upward when the panel would not fit, so the region's edge
// never clips it.

export interface MenuItem {
  /** Set apart from the ways above it by a hairline (a withdrawing way). */
  apart?: boolean;
  disabled?: boolean;
  label: string;
  onSelect: () => void;
}

/** A menu item's height in px (a 44 px hit area), and the panel's padding. */
const ITEM_PX = 44;
const PANEL_PADDING_PX = 8;
/** A hairline set before a way apart, with its margins (`my-1 h-px`). */
const HAIRLINE_PX = 9;

/** The nearest ancestor that scrolls on its own, or null for the page. */
function scrollRegionOf(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent);
    if ((overflowY === "auto" || overflowY === "scroll") && parent.scrollHeight > 0) return parent;
  }
  return null;
}

/**
 * Whether a panel of `height` px fits below `trigger` inside its scrolling
 * region (or the window); false opens it upward.
 */
function fitsBelow(trigger: HTMLElement, height: number): boolean {
  const region = scrollRegionOf(trigger);
  const bottom = region?.getBoundingClientRect().bottom ?? window.innerHeight;
  return bottom - trigger.getBoundingClientRect().bottom >= height;
}

export function Menu({
  align = "end",
  buttonClassName = "size-11",
  children,
  className,
  disabled = false,
  items,
  label,
  size = "icon",
  variant = "ghost",
}: Readonly<{
  /** Which edge of the button the panel lines up with. */
  align?: "end" | "start";
  /** Classes of the button itself; a 44 px square by default. */
  buttonClassName?: string;
  /** The button's face; the "more" glyph when none. */
  children?: ReactNode;
  className?: string;
  /** Pressed while a change is on its way: the button stays, only unavailable. */
  disabled?: boolean;
  items: readonly MenuItem[];
  /** What the button is for, for a screen reader. */
  label: string;
  size?: NonNullable<ComponentProps<typeof Button>["size"]>;
  variant?: NonNullable<ComponentProps<typeof Button>["variant"]>;
}>) {
  const [placement, setPlacement] = useState<"above" | "below" | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const open = placement !== null;

  const close = (focusTrigger: boolean) => {
    setPlacement(null);
    if (focusTrigger) trigger.current?.focus();
  };
  const toggle = () => {
    if (open || !trigger.current) {
      close(false);
      return;
    }
    const hairlines = items.filter((item) => item.apart).length * HAIRLINE_PX;
    const height = items.length * ITEM_PX + hairlines + PANEL_PADDING_PX * 2;
    setPlacement(fitsBelow(trigger.current, height) ? "below" : "above");
  };
  const enabled = () =>
    [...(box.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])].filter(
      (item) => !item.disabled,
    );

  // A press or focus outside closes it; the first way is where focus lands.
  useEffect(() => {
    if (!open) return;
    enabled()[0]?.focus();
    const away = (event: Event) => {
      const { target } = event;
      if (!(target instanceof Node) || !box.current) return;
      // Safari gives a pressed button's focus to the nearest focusable
      // ancestor, around the menu: that is not leaving it.
      if (box.current.contains(target) || target.contains(box.current)) return;
      setPlacement(null);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("focusin", away);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("focusin", away);
    };
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (!open) return;
    const ways = enabled();
    const at = ways.indexOf(document.activeElement as HTMLButtonElement);
    const go = (to: number) => {
      event.preventDefault();
      ways.at(to % ways.length)?.focus();
    };
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "ArrowDown") go(at + 1);
    else if (event.key === "ArrowUp") go(at <= 0 ? -1 : at - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(-1);
    else if (event.key === "Tab") close(false);
  };

  return (
    // Keys bubble up from the menu's own buttons; the box is no control itself.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- see above
    <div ref={box} className={cn("relative", className)} onKeyDown={onKeyDown}>
      <Button
        ref={trigger}
        type="button"
        variant={variant}
        size={size}
        className={buttonClassName}
        aria-label={label}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
      >
        {children ?? <MoreHorizontal aria-hidden className="size-5" />}
      </Button>
      {open && (
        <div
          id={panelId}
          role="menu"
          aria-label={label}
          data-placement={placement}
          className={cn(
            "absolute z-20 flex w-max min-w-52 flex-col rounded-card border border-line bg-panel p-2 shadow-lg",
            align === "end" ? "end-0" : "start-0",
            placement === "above" ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          {items.map((item) => [
            // A hairline before a way set apart; classes the pages already use.
            item.apart && (
              <div key={`${item.label}-apart`} role="separator" className="my-1 h-px bg-line" />
            ),
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                close(true);
                item.onSelect();
              }}
              className="min-h-11 rounded-pill px-4 text-start text-100 whitespace-nowrap transition-ui outline-none hover:bg-soft focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50"
            >
              {item.label}
            </button>,
          ])}
        </div>
      )}
    </div>
  );
}
