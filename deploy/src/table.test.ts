import { describe, expect, it } from "vitest";

import { dynamoKeys } from "./table";

// The keys come from the backend's own definition, the one the emulator
// tests create, so AWS and the tests cannot disagree. These check the shape
// SST's table needs, not the project's particular indexes.
describe("dynamoKeys", () => {
  const keys = dynamoKeys();

  it("is a pk/sk table with DynamoDB's TTL on `ttl`", () => {
    expect(keys.primaryIndex).toEqual({ hashKey: "pk", rangeKey: "sk" });
    expect(keys.ttl).toBe("ttl");
  });

  it("declares every key attribute as a string, and every index projects everything", () => {
    for (const key of ["pk", "sk"]) expect(keys.fields[key]).toBe("string");
    const indexes = Object.values(keys.globalIndexes);
    expect(indexes.map((index) => index.projection)).toEqual(indexes.map(() => "all"));
    const attributes = indexes.flatMap((index) => [index.hashKey, index.rangeKey ?? index.hashKey]);
    expect(attributes.map((name) => keys.fields[name])).toEqual(attributes.map(() => "string"));
  });
});
