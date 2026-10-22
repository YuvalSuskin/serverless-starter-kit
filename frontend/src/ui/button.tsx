// Adapted from shadcn/ui's new-york-v4 Button. This is our code now:
// - radius is the brand pill ("anything you tap is a pill"), not rounded-md
// - text is text-100 (16px), the smallest brand step; the xs sizes are gone
//   until decision D2 settles whether anything below 16px exists
// - ring-[3px] (an arbitrary value) is ring-3; the dark: variants are gone
// - on a touch screen (pointer-coarse) no button is under 44px, in either
//   direction; a mouse keeps the sizes below, so a laptop
//   looks as it did

import type { ComponentProps } from "react";

import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-pill text-100 font-medium whitespace-nowrap transition-ui outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 pointer-coarse:min-h-11 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/20",
        outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 has-[>svg]:px-4",
        sm: "h-9 gap-1.5 px-4 has-[>svg]:px-3",
        lg: "h-12 px-7 has-[>svg]:px-5",
        icon: "size-10 pointer-coarse:min-w-11",
        "icon-sm": "size-9 pointer-coarse:min-w-11",
        "icon-lg": "size-12 pointer-coarse:min-w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  pending = false,
  children,
  disabled,
  onClick,
  ...props
}: Readonly<
  ComponentProps<"button"> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean;
      pending?: boolean;
    }
>) {
  // size-3 (12px) at start-1 (4px) spans 4-16px: inside every size's own
  // padding (sm's 16px is the narrowest), never over the label (rule 1:
  // pending keeps the button's box and label exactly as they were).
  // Drawn inline rather than imported from lucide-react (the budget cost of
  // one more library on every page): this is lucide's
  // own loader-circle path (ISC-licensed), copied once rather than pulled in
  // as a dependency.
  const spinner = pending ? (
    <span className="pointer-events-none absolute inset-y-0 start-1 flex items-center">
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3 animate-spin motion-reduce:animate-none"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    </span>
  ) : null;

  // aria-disabled, not the native `disabled` attribute: a pending button
  // keeps its focus and full opacity (native `disabled` blurs to <body> and
  // dims via disabled:opacity-50) -- only its click is guarded.
  const ariaDisabled = pending ? "true" : props["aria-disabled"];
  const handleClick: typeof onClick = pending
    ? (event) => {
        event.preventDefault();
      }
    : onClick;

  if (asChild) {
    return (
      <Slot.Root
        data-slot="button"
        data-variant={variant}
        data-size={size}
        className={cn(buttonVariants({ className, size, variant }))}
        {...props}
        aria-busy={pending ? "true" : props["aria-busy"]}
        aria-disabled={ariaDisabled}
        onClick={handleClick}
      >
        <Slot.Slottable>{children}</Slot.Slottable>
        {spinner}
      </Slot.Root>
    );
  }

  return (
    <button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ className, size, variant }))}
      {...props}
      aria-busy={pending ? "true" : props["aria-busy"]}
      aria-disabled={ariaDisabled}
      disabled={disabled}
      onClick={handleClick}
    >
      {spinner}
      {children}
    </button>
  );
}
