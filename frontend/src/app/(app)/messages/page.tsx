// Skeleton: the template's app page, replaced by bootstrap step 6.
import type { Metadata } from "next";

import { MessagesList } from "./_components/messages-list";

export const metadata: Metadata = { title: "Messages" };

// The demo app page: the messages visitors sent, newest first.
export default function MessagesPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10">
      <h1 className="text-300 font-semibold">Messages</h1>
      <MessagesList />
    </main>
  );
}
