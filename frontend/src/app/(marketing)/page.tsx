// Skeleton: the template's home page, replaced by bootstrap step 6.
import type { Metadata } from "next";

import Link from "next/link";

import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Home",
  description:
    "The template's home page: a way to write to the owner and a way to read the messages.",
  path: "/",
});

// The demo home page: it links to the two pages the skeleton has, the public
// contact form and the app page that lists what was sent.
export default function HomePage() {
  const link =
    "flex min-h-11 w-fit items-center rounded-pill border border-line px-5 font-medium hover:bg-muted";
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-8 px-5 py-28">
      <header className="flex flex-col gap-2">
        <h1 className="text-400 font-semibold">Acme</h1>
        <p className="text-muted-foreground">
          A starting point: one public page, one app page and the API behind them.
        </p>
      </header>
      <nav aria-label="Pages" className="flex flex-wrap gap-3">
        <Link href="/contact" className={link}>
          Write a message
        </Link>
        <Link href="/messages" className={link}>
          Read the messages
        </Link>
      </nav>
    </main>
  );
}
