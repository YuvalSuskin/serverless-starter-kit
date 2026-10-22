import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

import { GetCommand } from "@aws-sdk/lib-dynamodb";

// The API's first request after a cold start paid for the DynamoDB client's
// first call: its connection to DynamoDB, its credentials and its request
// pipeline's first run. Made once during the
// start instead, it no longer waits in front of a visitor. A read of a key no
// item ever has: half a read unit per cold start, a shared cost.

/** The key read: no item is ever written under it. */
export const COLD_START_KEY = { pk: "COLDSTART", sk: "PRIME" } as const;

/** Reads COLD_START_KEY once; resolves either way, at the latest when `signal` aborts. */
export async function primeDynamo(
  db: DynamoDBDocumentClient,
  table: string,
  signal: AbortSignal,
): Promise<void> {
  try {
    await db.send(new GetCommand({ Key: COLD_START_KEY, TableName: table }), {
      abortSignal: signal,
    });
  } catch {
    // The first request makes the connection itself, as before.
  }
}
