import type { ComponentProps } from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Adapted from @000h-cojeev's Badge (frontend/CLAUDE.md: reach for it first):
// its API, a pill whose one meaning is in its text with an optional dot
// (BadgeIndicator), kept; its morphing outline, its theme variables and its
// palette of status colours dropped. Our tokens instead, and two treatments
// that differ in outline only: colour never reports a state,
// so the word says it and the dashed edge only echoes "not yet".
const badgeVariants = cva(
  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-pill border bg-background px-3 text-075 leading-none font-medium whitespace-nowrap text-foreground",
  {
    variants: {
      variant: {
        solid: "border-line",
        dashed: "border-dashed border-grey-900/60",
      },
    },
    defaultVariants: { variant: "solid" },
  },
);

/** A short word that names a state or a kind; never a control. */
export function Badge({
  className,
  variant,
  ...props
}: Readonly<ComponentProps<"span"> & VariantProps<typeof badgeVariants>>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

/** The badge's dot, in its text's colour; a picture, hidden from screen readers. */
export function BadgeIndicator({ className, ...props }: Readonly<ComponentProps<"span">>) {
  return (
    <span
      aria-hidden
      data-slot="badge-indicator"
      className={cn("size-1.5 shrink-0 rounded-pill bg-current", className)}
      {...props}
    />
  );
}
