import type { LucideIcon, LucideProps } from "lucide-react";

import { cn } from "@/lib/utils";

// Arrows, chevrons and "back" point the wrong way in a right-to-left language unless mirrored.
// Wrap any icon whose meaning is a direction; leave symmetric icons alone.
export function DirectionalIcon({
  icon: Icon,
  className,
  ...props
}: LucideProps & { icon: LucideIcon }) {
  return <Icon aria-hidden className={cn("rtl:-scale-x-100", className)} {...props} />;
}
