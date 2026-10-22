// Builds the real app on fakes, seeded, and sends requests to it. The sweeps
// and route tests use it.
import { buildPath } from "@acme/contracts";

import type { Route } from "../../src/api/http/types";

import { createApp } from "../../src/api/app/create-app";
import { seedMessages } from "../../src/entries/dev/seed";
import { fakeMailer } from "../../src/fakes/mailer";
import { fakeMessageStore } from "../../src/fakes/message-store";
import { fakePlatform } from "../../src/fakes/platform";

// Where the skeleton's contact messages are mailed (the dev default).
export const TEST_OWNER_ADDRESS = "owner@example.test";

export interface Input {
  body?: unknown;
  params: Record<string, string>;
  query?: Record<string, string>;
}

export function testApp({ originSecret }: { originSecret?: string } = {}) {
  const { clock, log, platform } = fakePlatform();
  // Skeleton: the demo's contact messages and the mailbox their mail lands in
  // (bootstrap step 6 wires the first feature's store instead).
  const messages = fakeMessageStore(platform.usage);
  seedMessages(messages);
  const mailer = fakeMailer({ log, now: () => clock.now(), usage: platform.usage });
  const app = createApp({
    mailer,
    messages,
    originSecret,
    ownerAddress: TEST_OWNER_ADDRESS,
    platform,
    stage: "test",
  });

  function send(route: Route, input: Input, headers: Record<string, string> = {}) {
    const url = new URL(buildPath(route.contract, input.params), "http://localhost");
    for (const [name, value] of Object.entries(input.query ?? {}))
      url.searchParams.set(name, value);
    return app.request(url.toString(), {
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      headers: { "content-type": "application/json", ...headers },
      method: route.contract.method,
    });
  }

  return { app, clock, log, mailer, messages, platform, send };
}
