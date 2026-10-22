import { serve } from "@hono/node-server";
import { v7 } from "uuid";

import { cryptoRandom } from "../../adapters/random/crypto-random";
import { createApp } from "../../api/app/create-app";
import { fakeMailer } from "../../fakes/mailer";
import { fakeMessageStore } from "../../fakes/message-store";
import { fakePlatform } from "../../fakes/platform";
import { loadDevConfig } from "../../platform/config";
import { devMail } from "./dev-mail";
import { seedMessages } from "./seed";

// `pnpm dev`: the whole API in memory, on fakes, seeded -- no Docker, no AWS. Never bundled.
// DEV_API_PORT, 8787 by default: `pnpm preview` gives each worktree its own.
const { apiPort, ownerAddress } = loadDevConfig();

// Real time and real ids (UUIDv7, as in production), so what you create
// while clicking around is ordered and never collides after a restart.
const { platform } = fakePlatform({
  clock: { now: () => new Date() },
  ids: { next: () => v7() },
  random: cryptoRandom,
  print: true,
});

// Dev sends email as a stage whose email is on would: kept by the fake mailer and shown at /api/dev-mail.
const mailer = fakeMailer({ log: platform.log, usage: platform.usage });

// Skeleton: the demo's contact messages, seeded, in memory (replaced by
// bootstrap step 6). A message sent through the API is mailed to ownerAddress,
// which the fake mailer keeps at /api/dev-mail.
const messages = fakeMessageStore(platform.usage);
seedMessages(messages);

const app = createApp({
  mailer,
  messages,
  ownerAddress,
  platform,
  stage: "dev",
});

// The dev mailbox sits beside the app rather than inside it: the app serves
// nothing but registered routes.
// The server's own bindings go on to the app, which reads the path as sent.
const fetch = async (request: Request, env: object) =>
  devMail(mailer, request) ?? (await app.fetch(request, env));

// Loopback only: the fakes trust whatever a request claims, so anyone who can
// reach this port can act as any caller.
serve({ fetch, hostname: "127.0.0.1", port: apiPort }, () => {
  platform.log.info("dev API listening", {
    port: apiPort,
    url: `http://127.0.0.1:${apiPort.toString()}`,
  });
});
