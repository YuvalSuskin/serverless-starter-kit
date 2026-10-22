// Skeleton: the template's not-found page, replaced by bootstrap step 6.
import Link from "next/link";

// Every address that matches nothing: what happened, and a way home.
export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center gap-4 px-5 py-24 text-center text-100">
      <h1 className="text-400 font-semibold">This page does not exist.</h1>
      <p className="text-muted-foreground">The link may have changed, or have a typo in it.</p>
      <Link
        href="/"
        className="flex min-h-12 items-center rounded-pill bg-primary px-7 font-medium text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
      >
        Back to the home page
      </Link>
    </main>
  );
}
