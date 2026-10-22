// A local stand-in for SES v2's SendEmail (REST-JSON: POST
// /v2/email/outbound-emails), so the Mailer suite runs the real SDK's request
// end to end: there is no SES emulator. It reads what the SDK sends, answers
// `{ MessageId }` as SES does, and an error with SES's `x-amzn-errortype`
// header: MessageRejected for an address on its refused list, a tag value
// outside SES's characters as BadRequestException, and, on demand, the next
// requests as TooManyRequestsException (the SDK retries those), or the next
// one as any error SES names (EM23). The dev
// deploy proves the real SES.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import type { Delivered } from "./mailer.contract";

const PATH = "/v2/email/outbound-emails";
const TAG_VALUE = /^[\w-]{1,256}$/;

interface SendEmailBody {
  ConfigurationSetName?: string;
  Content?: {
    Simple?: {
      Body?: { Html?: { Data?: string }; Text?: { Data?: string } };
      Subject?: { Data?: string };
    };
  };
  Destination?: { BccAddresses?: string[]; CcAddresses?: string[]; ToAddresses?: string[] };
  EmailTags?: { Name: string; Value: string }[];
  FromEmailAddress?: string;
  ReplyToAddresses?: string[];
}

interface SesReceived extends Delivered {
  configurationSet: string | undefined;
  from: string | undefined;
  tags: Readonly<Record<string, string>>;
}

export interface SesStandIn {
  close: () => Promise<void>;
  endpoint: string;
  /** The next `count` requests are answered 429, as SES does when sending too fast. */
  throttleNext: (count: number) => void;
  /** The next request is answered with this SES error type, as a 400. */
  failNextWith: (type: string) => void;
  /** Every request, failed ones included. */
  attempts: () => number;
  /** What it accepted. */
  received: () => readonly SesReceived[];
}

async function read(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function fail(response: ServerResponse, status: number, type: string, message: string) {
  response
    .writeHead(status, {
      "content-type": "application/json",
      "x-amzn-errortype": `${type}:http://internal.amazon.com/coral/com.amazonaws.sesv2/`,
    })
    .end(JSON.stringify({ message }));
}

export async function sesStandIn({
  refused = [],
  streams,
}: {
  refused?: readonly string[];
  /** Which configuration set names which stream, as the adapter's config does. */
  streams: Readonly<Record<string, string>>;
}): Promise<SesStandIn> {
  const received: SesReceived[] = [];
  let attempts = 0;
  let throttled = 0;
  let failWith: string | undefined;
  let count = 0;
  const server = createServer((request, response) => {
    void (async () => {
      const text = await read(request);
      attempts += 1;
      if (request.method !== "POST" || request.url !== PATH) {
        fail(response, 404, "NotFoundException", "no such operation");
        return;
      }
      if (failWith !== undefined) {
        const type = failWith;
        failWith = undefined;
        fail(response, 400, type, "refused on demand");
        return;
      }
      if (throttled > 0) {
        throttled -= 1;
        fail(response, 429, "TooManyRequestsException", "Maximum sending rate exceeded.");
        return;
      }
      const body = JSON.parse(text) as SendEmailBody;
      const to = body.Destination?.ToAddresses ?? [];
      if (to.some((address) => refused.includes(address))) {
        fail(response, 400, "MessageRejected", "Email address is not verified.");
        return;
      }
      const tags = Object.fromEntries((body.EmailTags ?? []).map((tag) => [tag.Name, tag.Value]));
      if (Object.values(tags).some((value) => !TAG_VALUE.test(value))) {
        fail(response, 400, "BadRequestException", "Invalid tag value.");
        return;
      }
      const simple = body.Content?.Simple;
      received.push({
        bcc: body.Destination?.BccAddresses ?? [],
        cc: body.Destination?.CcAddresses ?? [],
        configurationSet: body.ConfigurationSetName,
        from: body.FromEmailAddress,
        html: simple?.Body?.Html?.Data ?? "",
        kind: tags.kind ?? "",
        replyTo: body.ReplyToAddresses ?? [],
        stream: streams[body.ConfigurationSetName ?? ""] ?? "",
        subject: simple?.Subject?.Data ?? "",
        tags,
        text: simple?.Body?.Text?.Data ?? "",
        to,
      });
      count += 1;
      response
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ MessageId: `m-${String(count)}` }));
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return {
    attempts: () => attempts,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
    endpoint: `http://127.0.0.1:${String(address.port)}`,
    failNextWith: (type) => {
      failWith = type;
    },
    received: () => received,
    throttleNext: (n) => {
      throttled = n;
    },
  };
}
