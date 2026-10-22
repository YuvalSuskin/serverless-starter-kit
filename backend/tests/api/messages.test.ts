// Skeleton: the template's demo routes, replaced by bootstrap step 6.
// The contact message API on fakes, through the real app: a visitor sends
// one, it is stored and mailed to the owner, and the list shows it.
import { contracts, ErrorBody, Message, type Page } from "@acme/contracts";
import { describe, expect, it } from "vitest";

import { DEMO_UNIT } from "../../src/domain/messages";
import { devMail } from "../../src/entries/dev/dev-mail";
import { SEED_MESSAGES } from "../../src/entries/dev/seed";
import { TEST_OWNER_ADDRESS, testApp } from "../support/test-app";

const visitor = { body: "Do you do weddings?", email: "maya@example.test", name: "Maya" };

async function post(app: Awaited<ReturnType<typeof testApp>>["app"], body: unknown) {
  return await app.request(contracts.public.sendMessage.path, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("POST /api/public/messages", () => {
  it("stores the message and mails the owner at the configured address", async () => {
    const { app, mailer, messages } = testApp();
    const response = await post(app, visitor);
    expect(response.status).toBe(200);
    const sent = Message.parse(await response.json());
    expect(sent).toMatchObject(visitor);
    expect((await messages.list(1))[0]).toEqual(sent);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({ replyTo: visitor.email, to: TEST_OWNER_ADDRESS });
  });

  it.each([
    ["an empty body", { ...visitor, body: "" }],
    ["a body of spaces", { ...visitor, body: "   " }],
    ["an address that is not one", { ...visitor, email: "maya" }],
    ["no name", { body: visitor.body, email: visitor.email }],
  ])("refuses %s with 400 invalid, storing and mailing nothing", async (_, input) => {
    const { app, mailer, messages } = testApp();
    const before = (await messages.list(100)).length;
    const response = await post(app, input);
    expect(response.status).toBe(400);
    expect(ErrorBody.parse(await response.json()).code).toBe("invalid");
    expect(contracts.public.sendMessage.errors).toContain("invalid");
    expect(await messages.list(100)).toHaveLength(before);
    expect(mailer.sent).toEqual([]);
  });

  it("meters the write and the mail to the one unit, demo", async () => {
    const { app, log } = testApp();
    await post(app, visitor);
    const usage = log.lines.filter((line) => line.fields.type === "usage");
    expect(usage.map((line) => line.fields.meter)).toEqual(["messages.write_units", "email.sent"]);
    for (const line of usage) expect(line.fields.unitId).toBe(DEMO_UNIT);
  });

  it("shows the mail at /api/dev-mail", async () => {
    const { app, mailer } = testApp();
    await post(app, visitor);
    const sent = devMail(mailer, new Request("http://localhost/api/dev-mail/sent.json"));
    const emails = (await sent?.json()) as { subject: string; to: string }[];
    expect(emails).toHaveLength(1);
    expect(emails[0]?.to).toBe(TEST_OWNER_ADDRESS);
    const page = await devMail(mailer, new Request("http://localhost/api/dev-mail"))?.text();
    expect(page).toContain(visitor.name);
  });
});

describe("GET /api/public/messages", () => {
  it("lists the seeded messages, newest first", async () => {
    const { app } = testApp();
    const response = await app.request(contracts.public.listMessages.path);
    expect(response.status).toBe(200);
    const page = (await response.json()) as Page<Message>;
    expect(page.items.map((m) => m.id)).toEqual(
      SEED_MESSAGES.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)).map((m) => m.id),
    );
    expect(page.nextCursor).toBeNull();
  });

  it("shows a message just sent first, and honours ?limit", async () => {
    const { app } = testApp();
    const sent = Message.parse(await (await post(app, visitor)).json());
    const response = await app.request(`${contracts.public.listMessages.path}?limit=2`);
    const page = (await response.json()) as Page<Message>;
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toEqual(sent);
  });

  it("refuses a limit that is not a whole number from 1 to 100", async () => {
    const { app } = testApp();
    for (const limit of ["0", "101", "x", "1.5"]) {
      const response = await app.request(`${contracts.public.listMessages.path}?limit=${limit}`);
      expect(response.status).toBe(400);
    }
  });

  it("meters nothing on a read: the skeleton meters writes and mail only", async () => {
    const { app, log } = testApp();
    await app.request(contracts.public.listMessages.path);
    expect(log.lines.filter((line) => line.fields.type === "usage")).toEqual([]);
  });
});
