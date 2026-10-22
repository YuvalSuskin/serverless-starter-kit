"use client";

import { Tabs as Primitive } from "radix-ui";
import { type ComponentProps, createContext, use } from "react";

import { DIRECTION } from "@/lib/locale";
import { cn } from "@/lib/utils";

// A few views of one thing, one shown at a time. From @000h-cojeev/tabs' pills appearance (frontend/CLAUDE.md,
// "Reach for @000h-cojeev first"), on Radix's Tabs from the radix-ui package
// the app already uses, restyled to our tokens: its flow-group marker, morph
// and presence helpers are left out. Every tab is a pill, at
// least 44px tall on a phone. Manual activation by default:
// arrowing over a tab moves focus, and Enter or Space opens it.

// The open tab, so a tab styles itself with classes the app already has
// rather than a data-state variant of its own.
const Open = createContext<string | undefined>(undefined);

export function Tabs({
  activationMode = "manual",
  className,
  value,
  ...props
}: Readonly<ComponentProps<typeof Primitive.Root>>) {
  return (
    <Open value={value}>
      <Primitive.Root
        dir={DIRECTION}
        activationMode={activationMode}
        className={cn("flex min-h-0 flex-col gap-4", className)}
        value={value}
        {...props}
      />
    </Open>
  );
}

export function TabsList({ className, ...props }: Readonly<ComponentProps<typeof Primitive.List>>) {
  return (
    <Primitive.List
      className={cn("flex flex-wrap gap-1 self-start rounded-pill bg-soft p-1", className)}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  value,
  ...props
}: Readonly<ComponentProps<typeof Primitive.Trigger>>) {
  const open = use(Open) === value;
  return (
    <Primitive.Trigger
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-pill px-3 text-100 font-medium text-muted-foreground transition-ui outline-none pointer-coarse:min-h-11",
        "hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring",
        open && "bg-panel text-foreground shadow-xs",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      value={value}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: Readonly<ComponentProps<typeof Primitive.Content>>) {
  return (
    <Primitive.Content
      className={cn("flex min-h-0 flex-col gap-4 outline-none", className)}
      {...props}
    />
  );
}
