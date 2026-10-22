// Skeleton: the template's demo store, replaced by bootstrap step 6.
import { documentClient } from "../../src/adapters/dynamodb/client";
import { dynamoMessageStore } from "../../src/adapters/dynamodb/message-store";
import { tableDefinition } from "../../src/adapters/dynamodb/table";
import { messageStoreOnEmulator } from "./on-emulators";

messageStoreOnEmulator("DynamoDB Local", { documentClient, dynamoMessageStore, tableDefinition });
