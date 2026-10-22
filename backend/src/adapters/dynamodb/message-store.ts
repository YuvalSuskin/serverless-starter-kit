// Skeleton: the template's demo adapter, replaced by bootstrap step 6.
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import * as z from "zod";

import type { MessageStore } from "../../domain/ports";
import type { Usage } from "../../platform/usage";

import { DEMO_UNIT } from "../../domain/messages";
import { writeUnits } from "../../platform/request-units";

// Every item is parsed when read.
const SCHEMA_VERSION = 1;
const StoredVersion = z.object({ schemaVersion: z.literal(SCHEMA_VERSION) });
const Fields = z.object({
  body: z.string(),
  createdAt: z.string(),
  email: z.string(),
  id: z.string(),
  name: z.string(),
});

const PARTITION = `UNIT#${DEMO_UNIT}`;
const PREFIX = "MESSAGE#";

/**
 * The demo unit's messages in one partition, sorted by time: the key is the
 * ISO time then the id, so newest first is one Query read backwards, and two
 * messages sent in the same millisecond keep their own items.
 */
export function dynamoMessageStore(
  db: DynamoDBDocumentClient,
  table: string,
  usage: Usage,
): MessageStore {
  return {
    async list(limit) {
      const result = await db.send(
        new QueryCommand({
          ConsistentRead: true,
          ExpressionAttributeValues: { ":pk": PARTITION, ":prefix": PREFIX },
          KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
          Limit: limit,
          ScanIndexForward: false,
          TableName: table,
        }),
      );
      return (result.Items ?? []).map((item) => {
        StoredVersion.parse(item);
        return Fields.parse(item);
      });
    },

    async put(message) {
      const item = {
        ...message,
        pk: PARTITION,
        schemaVersion: SCHEMA_VERSION,
        sk: `${PREFIX}${message.createdAt}#${message.id}`,
      };
      await db.send(new PutCommand({ Item: item, TableName: table }));
      usage.record("messages.write_units", writeUnits([item]));
    },
  };
}
