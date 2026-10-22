// Skeleton: the template's demo use case, replaced by bootstrap step 6.
import { describe, expect, it } from "vitest";

import { recordingUsage } from "../../../tests/support/recording-usage";
import { fakeClock } from "../../fakes/clock";
import { sequentialIds } from "../../fakes/ids";
import { recordingLogger } from "../../fakes/logger";
import { fakeMailer } from "../../fakes/mailer";
import { fakeMessageStore } from "../../fakes/message-store";
import { sendMessage } from "./send-message";

const OWNER = "owner@example.test";
const input = { body: "Do you do weddings?", email: "maya@example.test", name: "Maya" };

function world(withOwner = true) {
  const { records, usage } = recordingUsage();
  const log = recordingLogger();
  const mailer = fakeMailer({ log, usage });
  const messages = fakeMessageStore(usage);
  const deps = {
    clock: fakeClock("2026-03-04T10:00:00.000Z"),
    ids: sequentialIds(),
    log,
    mailer,
    messages,
    ownerAddress: withOwner ? OWNER : undefined,
  };
  return { deps, log, mailer, messages, records };
}

describe("sendMessage", () => {
  it("stores the message, stamped with an id and the time", async () => {
    const { deps, messages } = world();
    const sent = await sendMessage(deps, input);
    expect(sent).toEqual({
      ...input,
      createdAt: "2026-03-04T10:00:00.000Z",
      id: "00000000-0000-7000-8000-000000000001",
    });
    expect(await messages.list(10)).toEqual([sent]);
  });

  it("emails the owner once, with the visitor's address to reply to", async () => {
    const { deps, mailer } = world();
    await sendMessage(deps, input);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({
      kind: "contact_message",
      replyTo: input.email,
      to: OWNER,
    });
    expect(mailer.sent[0]?.text).toContain(input.body);
    expect(mailer.sent[0]?.html).toContain(input.body);
  });

  it("escapes what the visitor typed in the HTML version", async () => {
    const { deps, mailer } = world();
    await sendMessage(deps, { ...input, body: "<script>alert(1)</script>" });
    expect(mailer.sent[0]?.html).not.toContain("<script>");
    expect(mailer.sent[0]?.html).toContain("&lt;script&gt;");
  });

  it("meters the write and the mail", async () => {
    const { deps, records } = world();
    await sendMessage(deps, input);
    expect(records.map((record) => record.meter)).toEqual(["messages.write_units", "email.sent"]);
  });

  it("keeps the message when the mail cannot be sent, and says so in the log", async () => {
    const { deps, log, messages } = world();
    const failing = fakeMailer({ fails: true, log, usage: recordingUsage().usage });
    const sent = await sendMessage({ ...deps, mailer: failing }, input);
    expect(await messages.list(10)).toEqual([sent]);
    expect(log.lines.map((line) => line.message)).toContain("message email not sent");
    expect(JSON.stringify(log.lines)).not.toContain(input.email);
  });

  it("stores the message and sends nothing when no owner address is set", async () => {
    const { deps, mailer, messages } = world(false);
    await sendMessage(deps, input);
    expect(await messages.list(10)).toHaveLength(1);
    expect(mailer.sent).toEqual([]);
  });
});
