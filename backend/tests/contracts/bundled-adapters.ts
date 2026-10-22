// What bundled.emulator.test.ts bundles: the real adapters the contract
// suites exercise. Skeleton: the demo's store is one of them; bootstrap step
// 6 puts the first store's adapter in its place.
export { documentClient } from "../../src/adapters/dynamodb/client";
export { dynamoMessageStore } from "../../src/adapters/dynamodb/message-store";
export { tableDefinition } from "../../src/adapters/dynamodb/table";
export { sesMailer, unavailableMailer } from "../../src/adapters/ses/mailer";
