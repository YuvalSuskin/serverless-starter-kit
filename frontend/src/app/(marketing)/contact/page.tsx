// Skeleton: the template's public page, replaced by bootstrap step 6.
import type { Metadata } from "next";

import { ContactForm } from "@/features/contact";

export const metadata: Metadata = {
  title: "Contact",
  description: "Send the owner a message.",
};

// The demo public page: a visitor writes to the owner, who is mailed the
// message.
export default function ContactPage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-8 px-5 py-28 text-100">
      <header className="flex flex-col gap-2">
        <h1 className="text-300 font-semibold">Contact</h1>
        <p className="text-muted-foreground">Write to us and we will reply by email.</p>
      </header>
      <ContactForm />
    </main>
  );
}
