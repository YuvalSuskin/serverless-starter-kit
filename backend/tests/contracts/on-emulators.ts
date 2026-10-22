// Each suite's emulator wiring, given the adapter modules to run it on:
// *.emulator.test.ts passes the source, bundled.emulator.test.ts the same
// adapters as esbuild bundles them for the Lambda.
import { CreateTableCommand, UpdateTimeToLiveCommand } from "@aws-sdk/client-dynamodb";
import { randomUUID } from "node:crypto";
import { beforeAll, inject } from "vitest";

import type { documentClient } from "../../src/adapters/dynamodb/client";
import type { dynamoMessageStore } from "../../src/adapters/dynamodb/message-store";
import type { tableDefinition } from "../../src/adapters/dynamodb/table";
import type { sesMailer, unavailableMailer } from "../../src/adapters/ses/mailer";

import { timeToLive } from "../../src/adapters/dynamodb/table";
import { recordingLogger } from "../../src/fakes/logger";
import { recordingUsage } from "../support/recording-usage";
import { TEST_CREDENTIALS } from "./emulators";
import { mailerContract, REFUSED_ADDRESS } from "./mailer.contract";
import { messageStoreContract } from "./message-store.contract";
import { type SesStandIn, sesStandIn } from "./ses-stand-in";

// A fresh table for one suite, created before its tests run.
function freshTable(adapters: {
  documentClient: typeof documentClient;
  tableDefinition: typeof tableDefinition;
}) {
  const table = `acme-${randomUUID()}`;
  const db = adapters.documentClient(inject("dynamodbEndpoint"));
  beforeAll(async () => {
    await db.send(new CreateTableCommand(adapters.tableDefinition(table)));
    await db.send(new UpdateTimeToLiveCommand(timeToLive(table)));
  });
  return { db, table };
}

export interface MessageStoreAdapters {
  documentClient: typeof documentClient;
  dynamoMessageStore: typeof dynamoMessageStore;
  tableDefinition: typeof tableDefinition;
}

// Skeleton: the template's demo store, replaced by bootstrap step 6.
/** Runs the MessageStore suite on DynamoDB Local, in a fresh table. */
export function messageStoreOnEmulator(name: string, adapters: MessageStoreAdapters) {
  const { db, table } = freshTable(adapters);
  messageStoreContract(name, () => {
    const { records, usage } = recordingUsage();
    return { metered: () => records, store: adapters.dynamoMessageStore(db, table, usage) };
  });
}

/** The stage's two configuration sets, as the stand-in reads them back. */
export const SES_STREAMS = {
  notices: "acme-test-notices",
  team: "acme-test-team",
} as const;

/** The SES adapter against a local stand-in of SES v2: no emulator exists. */
export function mailerOnStandIn(
  name: string,
  adapters: { sesMailer: typeof sesMailer; unavailableMailer: typeof unavailableMailer },
) {
  let standIn: SesStandIn | undefined;
  beforeAll(async () => {
    standIn = await sesStandIn({
      refused: [REFUSED_ADDRESS],
      streams: { [SES_STREAMS.notices]: "notices", [SES_STREAMS.team]: "team" },
    });
    return () => standIn?.close();
  });
  mailerContract(name, () => {
    if (!standIn) throw new Error("the SES stand-in is not running");
    const ses = standIn;
    const { records, usage } = recordingUsage();
    const log = recordingLogger();
    const config = {
      configurationSets: SES_STREAMS,
      from: "no-reply@test.example.test",
      fromName: "Acme",
    };
    const client = { credentials: TEST_CREDENTIALS, region: "us-east-1" };
    return {
      delivered: () =>
        ses.received().map((email) => ({
          bcc: email.bcc,
          cc: email.cc,
          html: email.html,
          kind: email.kind,
          replyTo: email.replyTo,
          stream: email.stream,
          subject: email.subject,
          text: email.text,
          to: email.to,
        })),
      // A closed port: nothing listens there.
      down: adapters.sesMailer(config, usage, log, {
        ...client,
        endpoint: "http://127.0.0.1:9",
        maxAttempts: 1,
      }),
      log,
      mailer: adapters.sesMailer(config, usage, log, { ...client, endpoint: ses.endpoint }),
      records,
      unavailable: adapters.unavailableMailer,
    };
  });
}
