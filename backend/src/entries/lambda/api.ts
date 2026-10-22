import { ORIGIN_SECRET_HEADER } from "@acme/contracts/client/core";
import { handle } from "hono/aws-lambda";

import { systemClock } from "../../adapters/clock/system-clock";
import { documentClient } from "../../adapters/dynamodb/client";
import { primeDynamo } from "../../adapters/dynamodb/cold-start";
import { dynamoMessageStore } from "../../adapters/dynamodb/message-store";
import { uuidV7Ids } from "../../adapters/ids/uuid-v7";
import { powertoolsLogger } from "../../adapters/logger/powertools";
import { cryptoRandom } from "../../adapters/random/crypto-random";
import { sesMailer, unavailableMailer } from "../../adapters/ses/mailer";
import { createApp } from "../../api/app/create-app";
import { prime } from "../../platform/cold-start";
import { loadConfig } from "../../platform/config";
import { METRICS, type Metrics } from "../../platform/metrics";
import { createUsage } from "../../platform/usage";

// The production API. Remote adapters are wired only in
// src/entries/lambda/. Built by scripts/build.ts into dist/api.mjs.
// Everything here runs once per cold start; config fails fast if the
// environment is incomplete.
const config = loadConfig();
const log = powertoolsLogger(config.logLevel);

// The metrics catalog is empty, so there is nothing to emit yet.
// The Powertools Metrics adapter arrives with the first catalogued metric.
const metrics: Metrics = {
  emit: () => {
    throw new Error(`No metrics are catalogued yet: ${JSON.stringify(METRICS)}`);
  },
};

const usage = createUsage(log, () => systemClock.now());
const db = documentClient(config.dynamodb.endpoint);
const table = config.dynamodb.table;

// The stage's mail over SES when its email is on; off, nothing is sent (EM8).
const mailer = config.email ? sesMailer(config.email, usage, log) : unavailableMailer;

const app = createApp({
  // Skeleton: the demo's mail to the owner, and its messages (replaced by bootstrap step 6).
  mailer,
  messages: dynamoMessageStore(db, table, usage),
  originSecret: config.originSecret,
  ownerAddress: config.ownerAddress,
  platform: {
    clock: systemClock,
    ids: uuidV7Ids,
    log,
    metrics,
    random: cryptoRandom,
    usage,
  },
  stage: config.stage,
});

export const handler = handle(app);

// The cold start makes the first request's one-off work its own (decision
// CS2): DynamoDB's connection and the client's first call, and the app's
// first answer (its router, middleware and log line), at most a second.
if (config.primeColdStart) {
  await prime([
    (signal) => primeDynamo(db, table, signal),
    async (signal) =>
      await app.request("/api/health", {
        headers: config.originSecret ? { [ORIGIN_SECRET_HEADER]: config.originSecret } : {},
        signal,
      }),
  ]);
}
