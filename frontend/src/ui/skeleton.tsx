"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export const SKELETON_DELAY_MS = 180;

const STEP_SIZES = {
  "050": "var(--size-050)",
  "075": "var(--size-075)",
  "100": "var(--size-100)",
  "200": "var(--size-200)",
  "300": "var(--size-300)",
  "400": "var(--size-400)",
  "500": "var(--size-500)",
} as const;

const LEADING_FACTORS = {
  none: 1,
  tight: 1.25,
  snug: 1.375,
  normal: 1.5,
} as const;

export function SkeletonGroup({
  label,
  delayMs = SKELETON_DELAY_MS,
  children,
}: Readonly<{
  label: string;
  delayMs?: number;
  children: React.ReactNode;
}>) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShown(true);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [delayMs]);

  if (!shown) {
    return <></>;
  }

  return (
    <div role="status">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function Skeleton({
  className,
  style,
}: Readonly<{
  className?: string;
  style?: React.CSSProperties;
}>) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse bg-grey-200/50 motion-reduce:animate-none", className)}
      style={style}
    />
  );
}

export function SkeletonText({
  className,
  step,
  leading = "normal",
  width,
}: Readonly<{
  /** For a surface the page tint does not suit (a dark one). */
  className?: string;
  step: "050" | "075" | "100" | "200" | "300" | "400" | "500";
  leading?: "none" | "tight" | "snug" | "normal";
  width: string | number;
}>) {
  const factor = LEADING_FACTORS[leading];
  const size = STEP_SIZES[step];

  return (
    <Skeleton
      className={cn("rounded-input", className)}
      style={{
        width,
        height: `calc(${String(factor)} * ${size})`,
      }}
    />
  );
}
