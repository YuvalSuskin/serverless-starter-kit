import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it, vi } from "vitest";

import { COLD_START_KEY, primeDynamo } from "./cold-start";

// One read of a key no item has, made during the cold start.
describe("primeDynamo", () => {
  it("reads the cold start's key, which no store writes, with the start's signal", async () => {
    const send = vi.fn(() => Promise.resolve({}));
    const signal = new AbortController().signal;
    await primeDynamo({ send } as unknown as DynamoDBDocumentClient, "acme", signal);
    expect(send).toHaveBeenCalledTimes(1);
    const [command, options] = send.mock.calls[0] as unknown as [GetCommand, object];
    expect(command).toBeInstanceOf(GetCommand);
    expect(command.input).toEqual({ Key: COLD_START_KEY, TableName: "acme" });
    expect(options).toEqual({ abortSignal: signal });
    expect(COLD_START_KEY.pk).not.toContain("#");
  });

  it("an error is the first request's to meet again, not the start's", async () => {
    const send = vi.fn(() => Promise.reject(new Error("throttled")));
    await expect(
      primeDynamo(
        { send } as unknown as DynamoDBDocumentClient,
        "acme",
        new AbortController().signal,
      ),
    ).resolves.toBeUndefined();
  });
});
