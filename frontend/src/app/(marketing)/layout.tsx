// Skeleton: the template's public frame, replaced by bootstrap step 6.
import type { Metadata } from "next";
import type { ReactNode } from "react";

import Link from "next/link";

import { publicLayoutMetadata, siteUrl } from "@/lib/site";

// Relative canonical and share addresses resolve against the site.
export const metadata: Metadata = publicLayoutMetadata(siteUrl());

const LINK = "flex min-h-11 items-center underline-offset-4 hover:underline";

// The public frame: a top bar and a footer on every public page, plain English
// and left to right. Every link is at least 44px tall, as a finger needs.
export default function PublicLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col text-100">
      <header className="border-be border-line">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5"
        >
          <Link href="/" className="flex min-h-11 items-center font-semibold">
            Acme
          </Link>
          <Link href="/contact" className={LINK}>
            Contact
          </Link>
        </nav>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-bs border-line">
        <nav
          aria-label="Footer"
          className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 px-5"
        >
          <Link href="/contact" className={LINK}>
            Contact
          </Link>
          <Link href="/messages" className={LINK}>
            Messages
          </Link>
        </nav>
      </footer>
    </div>
  );
}
