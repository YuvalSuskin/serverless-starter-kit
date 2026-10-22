// Skeleton: the template's signed-out "app" pillar, replaced by bootstrap step 6.
import type { Metadata } from "next";
import type { ReactNode } from "react";

import Link from "next/link";

// The app pillar has nothing for search engines.
export const metadata: Metadata = { robots: { index: false, follow: false } };

// The frame of the app pages: a bar with the way to the public page, and the
// page under it. The skeleton's copy is plain English, left to right.
export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col text-100">
      <header className="border-be border-line">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5"
        >
          <Link href="/messages" className="flex min-h-11 items-center font-semibold">
            Messages
          </Link>
          <Link href="/contact" className="flex min-h-11 items-center underline underline-offset-4">
            Contact page
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
