import { recordingLogger } from "../../src/fakes/logger";
import { fakeMailer } from "../../src/fakes/mailer";
import { recordingUsage } from "../support/recording-usage";
import { mailerContract } from "./mailer.contract";

mailerContract("fake", () => {
  const { records, usage } = recordingUsage();
  const log = recordingLogger();
  const mailer = fakeMailer({ log, usage });
  return {
    delivered: () =>
      mailer.sent.map((email) => ({
        bcc: [],
        cc: [],
        html: email.html,
        kind: email.kind,
        replyTo: [email.replyTo],
        stream: email.stream,
        subject: email.subject,
        text: email.text,
        to: [email.to],
      })),
    down: fakeMailer({ fails: true, log, usage }),
    log,
    mailer,
    records,
    unavailable: fakeMailer({ available: false, log, usage }),
  };
});
