"use client";

// Skeleton: the template's demo list, replaced by bootstrap step 6.
import { useMessages } from "@/lib/data/messages";
import { LOCALE } from "@/lib/locale";

const WHEN = new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeStyle: "short" });

// The stored messages, newest first, in the states a list has: loading,
// failed, empty and filled.
export function MessagesList() {
  const { data, error, isLoading } = useMessages();
  if (isLoading) return <p role="status">Loading messages…</p>;
  if (error || !data) return <p role="alert">We could not load the messages.</p>;
  if (data.length === 0) return <p>No messages yet.</p>;
  return (
    <ul className="flex flex-col gap-4">
      {data.map((message) => (
        <li
          key={message.id}
          className="flex flex-col gap-1 rounded-card border border-line bg-panel p-4"
        >
          <p className="font-semibold">{message.name}</p>
          <p className="text-muted-foreground">
            {message.email} ·{" "}
            <time dateTime={message.createdAt}>{WHEN.format(new Date(message.createdAt))}</time>
          </p>
          <p className="whitespace-pre-wrap">{message.body}</p>
        </li>
      ))}
    </ul>
  );
}
