import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

// In Lambda, region and credentials come from the environment. An endpoint
// (DynamoDB Local) needs a region and placeholder credentials of its own.
function baseClient(endpoint?: string): DynamoDBClient {
  return endpoint
    ? new DynamoDBClient({
        credentials: { accessKeyId: "local", secretAccessKey: "local" },
        endpoint,
        region: "local",
      })
    : new DynamoDBClient({});
}

export function documentClient(endpoint?: string): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(baseClient(endpoint), {
    marshallOptions: { removeUndefinedValues: true },
  });
}
