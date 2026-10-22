import { tableDefinition, TTL_ATTRIBUTE } from "../../backend/src/adapters/dynamodb/table.ts";

// The table's keys come from the backend's own definition, the one the
// emulator tests create, so AWS and the tests cannot
// disagree. This turns it into sst.aws.Dynamo's arguments.

type FieldType = "binary" | "number" | "string";

export interface DynamoKeys {
  fields: Record<string, FieldType>;
  globalIndexes: Record<string, { hashKey: string; projection: "all"; rangeKey?: string }>;
  primaryIndex: { hashKey: string; rangeKey?: string };
  /** The attribute DynamoDB's TTL reads (epoch seconds). */
  ttl: string;
}

const TYPES: Record<string, FieldType> = { B: "binary", N: "number", S: "string" };

function keysOf(schema: readonly { AttributeName?: string; KeyType?: string }[] | undefined) {
  const hashKey = schema?.find((key) => key.KeyType === "HASH")?.AttributeName;
  const rangeKey = schema?.find((key) => key.KeyType === "RANGE")?.AttributeName;
  if (hashKey === undefined) throw new Error("The table definition has a key without a HASH key");
  return rangeKey === undefined ? { hashKey } : { hashKey, rangeKey };
}

export function dynamoKeys(): DynamoKeys {
  const definition = tableDefinition("unused");
  if (definition.BillingMode !== "PAY_PER_REQUEST") {
    throw new Error("The table must stay on demand (pay per use, root CLAUDE.md)");
  }
  const fields: Record<string, FieldType> = {};
  for (const attribute of definition.AttributeDefinitions ?? []) {
    const type = TYPES[attribute.AttributeType ?? ""];
    if (attribute.AttributeName === undefined || type === undefined) {
      throw new Error("The table definition has an attribute without a name or type");
    }
    fields[attribute.AttributeName] = type;
  }
  const globalIndexes: DynamoKeys["globalIndexes"] = {};
  for (const index of definition.GlobalSecondaryIndexes ?? []) {
    if (index.IndexName === undefined || index.Projection?.ProjectionType !== "ALL") {
      throw new Error("Every index needs a name and projects ALL (extend this converter first)");
    }
    globalIndexes[index.IndexName] = { ...keysOf(index.KeySchema), projection: "all" };
  }
  return { fields, globalIndexes, primaryIndex: keysOf(definition.KeySchema), ttl: TTL_ATTRIBUTE };
}
