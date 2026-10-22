import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge only knows Tailwind's default scales. Without these lists it
// reads our `text-100` as a text COLOUR and cn("text-grey-900", "text-100")
// silently drops the colour. They must name exactly the text sizes and radii in
// globals.css's @theme; tests/theme-parity.test.ts fails if they drift.
export const BRAND_TEXT_STEPS = ["050", "075", "100", "200", "300", "400", "500"] as const;
export const BRAND_RADII = ["card", "input", "photo", "pill"] as const;

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [...BRAND_TEXT_STEPS],
      radius: [...BRAND_RADII],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
