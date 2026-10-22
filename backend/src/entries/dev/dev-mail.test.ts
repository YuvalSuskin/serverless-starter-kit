import { describe, expect, it } from "vitest";

import { anEmail } from "../../../tests/contracts/mailer.contract";
import { recordingUsage } from "../../../tests/support/recording-usage";
import { fakeMailer } from "../../fakes/mailer";
import { devMail } from "./dev-mail";

const get = (path: string) => new Request(`http://127.0.0.1:8787${path}`);

async function mailbox() {
  const mailer = fakeMailer({ usage: recordingUsage().usage });
  await mailer.send(anEmail({ subject: "first" }));
  await mailer.send(anEmail({ html: "<p><script>alert(1)</script></p>", subject: "second" }));
  return mailer;
}

describe("the dev mailbox (EM13)", () => {
  it("answers only its own paths", async () => {
    expect(devMail(await mailbox(), get("/api/public/messages"))).toBeUndefined();
    expect(devMail(await mailbox(), get("/api/dev-mailbox"))).toBeUndefined();
  });

  it("lists what was sent, newest first, as JSON for a test", async () => {
    const response = devMail(await mailbox(), get("/api/dev-mail/sent.json"));
    const sent = (await response?.json()) as { subject: string }[];
    expect(sent.map((email) => email.subject)).toEqual(["second", "first"]);
  });

  it("shows each email in a sandboxed frame, on a page that runs nothing", async () => {
    const response = devMail(await mailbox(), get("/api/dev-mail"));
    expect(response?.headers.get("content-security-policy")).toMatch(/^sandbox;/);
    const page = (await response?.text()) ?? "";
    expect(page).toContain("<iframe sandbox ");
    expect(page).not.toContain("<script>");
    expect(page.indexOf("second")).toBeLessThan(page.indexOf("first"));
  });

  it("refuses anything but reading", async () => {
    const response = devMail(
      await mailbox(),
      new Request("http://127.0.0.1:8787/api/dev-mail", { method: "POST" }),
    );
    expect(response?.status).toBe(405);
  });
});
