import { afterAll, beforeAll, expect, it } from "vitest";

import { sesMailer, unavailableMailer } from "../../src/adapters/ses/mailer";
import { recordingLogger } from "../../src/fakes/logger";
import { withLogContext } from "../../src/platform/log-context";
import { recordingUsage } from "../support/recording-usage";
import { TEST_CREDENTIALS } from "./emulators";
import { anEmail } from "./mailer.contract";
import { mailerOnStandIn, SES_STREAMS } from "./on-emulators";
import { type SesStandIn, sesStandIn } from "./ses-stand-in";

mailerOnStandIn("SES against a local stand-in of its API", { sesMailer, unavailableMailer });

// The adapter's own: what it asks SES for, beyond the port.
let ses: SesStandIn;
beforeAll(async () => {
  ses = await sesStandIn({
    streams: { [SES_STREAMS.notices]: "notices", [SES_STREAMS.team]: "team" },
  });
});
afterAll(() => ses.close());

function adapter() {
  const { records, usage } = recordingUsage();
  const mailer = sesMailer(
    { configurationSets: SES_STREAMS, from: "no-reply@test.example.test", fromName: "Acme" },
    usage,
    recordingLogger(),
    { credentials: TEST_CREDENTIALS, endpoint: ses.endpoint, region: "us-east-1" },
  );
  return { mailer, records };
}

const UNIT_ID = "0199f0c2-7b3a-7cc1-9d2e-5a1b2c3d4e5f";

it("MAIL-R2: sends from the app, by its display name, at the stage's sender address", async () => {
  await adapter().mailer.send(anEmail());
  expect(ses.received().at(-1)?.from).toBe("Acme <no-reply@test.example.test>");
});

it("shows the sender under the name the stage configures", async () => {
  const { records, usage } = recordingUsage();
  const mailer = sesMailer(
    { configurationSets: SES_STREAMS, from: "no-reply@test.example.test", fromName: "Dinner Club" },
    usage,
    recordingLogger(),
    { credentials: TEST_CREDENTIALS, endpoint: ses.endpoint, region: "us-east-1" },
  );
  await mailer.send(anEmail());
  expect(ses.received().at(-1)?.from).toBe("Dinner Club <no-reply@test.example.test>");
  expect(records).toEqual([{ meter: "email.sent", quantity: 1 }]);
});

it("MAIL-R10, MAIL-R17: sends each stream through its own configuration set (EM3)", async () => {
  const { mailer } = adapter();
  await mailer.send(anEmail({ stream: "team" }));
  expect(ses.received().at(-1)?.configurationSet).toBe(SES_STREAMS.team);
  await mailer.send(anEmail({ stream: "notices" }));
  expect(ses.received().at(-1)?.configurationSet).toBe(SES_STREAMS.notices);
});

it("tags the email with its kind and the unit in the log context", async () => {
  const { mailer } = adapter();
  await withLogContext({ correlationId: "c1", principal: "anonymous", unitId: UNIT_ID }, () =>
    mailer.send(anEmail()),
  );
  expect(ses.received().at(-1)?.tags).toEqual({ kind: "contact_message", unitId: UNIT_ID });
});

it("leaves out a unit id SES could not take as a tag, rather than fail the send", async () => {
  const { mailer } = adapter();
  await withLogContext({ correlationId: "c1", principal: "anonymous", unitId: "not an id!" }, () =>
    mailer.send(anEmail()),
  );
  expect(ses.received().at(-1)?.tags).toEqual({ kind: "contact_message" });
});

it("EM4: retries SES's throttle once, and meters the email once", async () => {
  const { mailer, records } = adapter();
  const before = ses.attempts();
  ses.throttleNext(1);
  await mailer.send(anEmail());
  expect(ses.attempts() - before).toBe(2);
  expect(records).toEqual([{ meter: "email.sent", quantity: 1 }]);
});

it("EM4: gives up after two throttled attempts, as email_unavailable", async () => {
  const { mailer, records } = adapter();
  ses.throttleNext(2);
  await expect(mailer.send(anEmail())).rejects.toMatchObject({ code: "email_unavailable" });
  expect(records).toEqual([]);
});

it("EM23: SES refusing the stage is email_blocked, not one refused address, and meters nothing", async () => {
  const { mailer, records } = adapter();
  for (const type of ["SendingPausedException", "AccessDeniedException"]) {
    ses.failNextWith(type);
    await expect(mailer.send(anEmail())).rejects.toMatchObject({ code: "email_blocked" });
  }
  ses.failNextWith("MessageRejected");
  await expect(mailer.send(anEmail())).rejects.toMatchObject({ code: "email_refused" });
  expect(records).toEqual([]);
});

it("never mails a never-mail domain's address: resolves unsent, unmetered, logged as skipped", async () => {
  const { records, usage } = recordingUsage();
  const log = recordingLogger();
  const mailer = sesMailer(
    {
      configurationSets: SES_STREAMS,
      from: "no-reply@test.example.test",
      fromName: "Acme",
      neverMail: ["example.com"],
    },
    usage,
    log,
    { credentials: TEST_CREDENTIALS, endpoint: ses.endpoint, region: "us-east-1" },
  );
  const before = ses.received().length;
  await mailer.send(anEmail({ to: "test.user@example.com" }));
  await mailer.send(anEmail({ to: "someone@mail.example.com" }));
  expect(ses.received()).toHaveLength(before);
  expect(records).toEqual([]);
  expect(log.lines.filter((line) => line.message === "email skipped")).toHaveLength(2);
  await mailer.send(anEmail({ to: "maya@example.test" }));
  expect(ses.received()).toHaveLength(before + 1);
});
