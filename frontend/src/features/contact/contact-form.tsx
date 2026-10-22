"use client";

// Skeleton: the template's demo contact form, replaced by bootstrap step 6.
import { type SyntheticEvent, useId, useState } from "react";

import { type MessageField, refusedFields, useSendMessage } from "@/lib/data/messages";
import { Button } from "@/ui/button";

// The form checks nothing itself: the contract is the one rule, and the API
// refuses what breaks it. The form says what it refused, in a sentence per
// issue (the API gives codes, never prose).

const LABELS: Record<MessageField, string> = { body: "Message", email: "Email", name: "Name" };

/** One whole sentence for a refused field, chosen by the API's issue code. */
function refusalText(field: MessageField, issue: string): string {
  const label = LABELS[field];
  if (issue === "too_small") return `${label} is required.`;
  if (issue === "too_big") return `${label} is too long.`;
  return `${label} is not valid.`;
}

const FAILED = "We could not send your message. Please try again.";
const SENT = "Thank you. Your message is sent.";

const input =
  "min-h-12 w-full rounded-input border border-line bg-panel px-4 text-100 outline-none focus-visible:ring-3 focus-visible:ring-ring aria-invalid:border-err";

type Values = Record<MessageField, string>;
const EMPTY: Values = { body: "", email: "", name: "" };

// A visitor's message to the owner. It keeps what was typed through a
// refusal, sends once while pending, and empties only once the API has stored
// the message.
export function ContactForm() {
  const id = useId();
  const { isPending, trigger } = useSendMessage();
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<MessageField, string>>>({});
  const [failed, setFailed] = useState(false);
  const [sent, setSent] = useState(false);

  const change = (field: MessageField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => key !== field)),
    );
    setSent(false);
  };

  const onSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;
    setFailed(false);
    setSent(false);
    try {
      await trigger(values);
      setValues(EMPTY);
      setErrors({});
      setSent(true);
    } catch (error) {
      const refused = refusedFields(error);
      if (refused && Object.keys(refused).length > 0) {
        setErrors(
          Object.fromEntries(
            Object.entries(refused).map(([field, issue]) => [
              field,
              refusalText(field as MessageField, issue),
            ]),
          ),
        );
      } else {
        setErrors({});
        setFailed(true);
      }
    }
  };

  const field = (name: MessageField, props: { autoComplete: string; type?: string }) => {
    const error = errors[name];
    const common = {
      "aria-describedby": error ? `${id}-${name}-error` : undefined,
      "aria-invalid": error ? true : undefined,
      id: `${id}-${name}`,
      name,
      onChange: (event: { target: { value: string } }) => {
        change(name, event.target.value);
      },
      value: values[name],
    };
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-${name}`} className="font-semibold">
          {LABELS[name]}
        </label>
        {name === "body" ? (
          <textarea {...common} rows={5} className={`${input} py-3`} />
        ) : (
          <input {...common} {...props} className={input} />
        )}
        {error && (
          <p id={`${id}-${name}-error`} className="text-err">
            {error}
          </p>
        )}
      </div>
    );
  };

  return (
    <form
      onSubmit={(event) => {
        void onSubmit(event);
      }}
      noValidate
      className="flex flex-col gap-5"
    >
      {failed && (
        <p role="alert" className="rounded-input bg-err-surface px-4 py-3 font-medium text-err">
          {FAILED}
        </p>
      )}
      {field("name", { autoComplete: "name" })}
      {field("email", { autoComplete: "email", type: "email" })}
      {field("body", { autoComplete: "off" })}
      <Button type="submit" size="lg" pending={isPending}>
        Send message
      </Button>
      <p role="status" className="font-medium text-ok">
        {sent ? SENT : ""}
      </p>
    </form>
  );
}
