import type {
  CreateTableCommandInput,
  UpdateTimeToLiveCommandInput,
} from "@aws-sdk/client-dynamodb";

// The attribute DynamoDB's TTL reads (epoch seconds): an item carrying it is
// deleted some time after that moment. TTL
// is not part of creating a table: the infrastructure applies `timeToLive` after it, as the emulator tests do.
// Reads never rely on the deletion having happened.
/** @public Read by deploy/src/table.ts, outside this package. */
export const TTL_ATTRIBUTE = "ttl";

export const timeToLive = (TableName: string): UpdateTimeToLiveCommandInput => ({
  TableName,
  TimeToLiveSpecification: { AttributeName: TTL_ATTRIBUTE, Enabled: true },
});

// The table's key design. Generic key names, so whether later
// entities share this table is decided with them. The infrastructure code
// (later) and the emulator tests both create the table from this.
export const tableDefinition = (TableName: string): CreateTableCommandInput => ({
  AttributeDefinitions: [
    { AttributeName: "pk", AttributeType: "S" },
    { AttributeName: "sk", AttributeType: "S" },
    { AttributeName: "gsi1pk", AttributeType: "S" },
    { AttributeName: "gsi1sk", AttributeType: "S" },
  ],
  BillingMode: "PAY_PER_REQUEST",
  GlobalSecondaryIndexes: [
    // A sparse index with generic key names: an item joins it by carrying
    // gsi1pk and gsi1sk, and no skeleton item does. The first store that
    // needs another access path uses it, or adds one beside it.
    {
      IndexName: "gsi1",
      KeySchema: [
        { AttributeName: "gsi1pk", KeyType: "HASH" },
        { AttributeName: "gsi1sk", KeyType: "RANGE" },
      ],
      Projection: { ProjectionType: "ALL" },
    },
  ],
  KeySchema: [
    { AttributeName: "pk", KeyType: "HASH" },
    { AttributeName: "sk", KeyType: "RANGE" },
  ],
  TableName,
});
