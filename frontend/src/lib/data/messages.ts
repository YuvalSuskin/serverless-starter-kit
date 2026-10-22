"use client";

// Skeleton: the template's demo hooks, replaced by bootstrap step 6.
import type { Message, NewMessage } from "@acme/contracts";

import { useCallback, useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import type { MutationResult, QueryResult } from "./types";

import { ApiError } from "./api-client";
import { publicCall } from "./public-call";

// The contact messages: what a visitor writes, and the list the app page
// shows. The list is cached under one key, so a message sent from the contact
// form is in it before the page is read again.

const MESSAGES_KEY = ["messages"] as const;

async function fetchMessages(): Promise<Message[]> {
  const page = await publicCall("listMessages", { body: undefined, params: {}, query: {} });
  return page.items;
}

/** The stored messages, newest first. */
export function useMessages(): QueryResult<Message[]> {
  const { data, error, isLoading } = useSWR<Message[], Error>(MESSAGES_KEY, fetchMessages);
  return { data, error, isLoading };
}

/**
 * Sends a message and answers with the stored one. Rejects with the API's
 * refusal: an `ApiError` whose `details` name each field it refused
 * (`code: "invalid"`). The stored message goes first in the cached list, which
 * is then read again behind it.
 */
export function useSendMessage(): MutationResult<NewMessage, Message> {
  const { mutate } = useSWRConfig();
  const [isPending, setPending] = useState(false);
  const trigger = useCallback(
    async (message: NewMessage) => {
      setPending(true);
      try {
        const stored = await publicCall("sendMessage", {
          body: message,
          params: {},
          query: {},
        });
        await mutate(
          MESSAGES_KEY,
          (current: Message[] | undefined) =>
            current === undefined ? current : [stored, ...current],
          { revalidate: true },
        );
        return stored;
      } finally {
        setPending(false);
      }
    },
    [mutate],
  );
  return { isPending, trigger };
}

/** The fields of a message the API can refuse. */
export type MessageField = keyof NewMessage;

const FIELDS: readonly MessageField[] = ["name", "email", "body"];

/**
 * Which fields of a message the API refused, and why: the first issue code
 * (a zod issue code such as `too_small`, never prose) of each. Undefined when
 * the failure is not a refusal of the input (offline, a 5xx), so it is never
 * taken for bad input; empty when the refusal names none of the fields.
 */
export function refusedFields(error: unknown): Partial<Record<MessageField, string>> | undefined {
  if (!(error instanceof ApiError) || error.code !== "invalid") return undefined;
  const refused: Partial<Record<MessageField, string>> = {};
  for (const { issue, path } of error.details ?? []) {
    const field = FIELDS.find((name) => path === `body.${name}`);
    if (field && refused[field] === undefined) refused[field] = issue;
  }
  return refused;
}
