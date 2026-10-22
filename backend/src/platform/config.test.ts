import { describe, expect, it } from "vitest";

import { loadConfig, loadDevConfig } from "./config";

const env = {
  STAGE: "test",
  TABLE_NAME: "acme",
};

describe("loadConfig", () => {
  it("parses a complete environment, with INFO as the default log level", () => {
    expect(loadConfig(env)).toEqual({
      dynamodb: { endpoint: undefined, table: "acme" },
      email: undefined,
      logLevel: "INFO",
      originSecret: undefined,
      ownerAddress: undefined,
      primeColdStart: false,
      stage: "test",
    });
  });

  // Only a Lambda's cold start primes; tests and dev do not.
  it("primes the cold start only where Lambda names the function", () => {
    expect(loadConfig(env).primeColdStart).toBe(false);
    expect(loadConfig({ ...env, AWS_LAMBDA_FUNCTION_NAME: "" }).primeColdStart).toBe(false);
    expect(
      loadConfig({ ...env, AWS_LAMBDA_FUNCTION_NAME: "acme-dev-ApiFunction" }).primeColdStart,
    ).toBe(true);
  });

  it("fails fast, naming every missing variable", () => {
    expect(() => loadConfig({})).toThrow(/STAGE, TABLE_NAME/);
    expect(() => loadConfig({ STAGE: "test" })).toThrow(/TABLE_NAME/);
  });

  it("takes an origin secret of at least 32 characters, and runs without one", () => {
    expect(loadConfig(env).originSecret).toBeUndefined();
    expect(loadConfig({ ...env, ORIGIN_SECRET: "s".repeat(32) }).originSecret).toBe("s".repeat(32));
    expect(() => loadConfig({ ...env, ORIGIN_SECRET: "short" })).toThrow(/ORIGIN_SECRET/);
  });

  // Behind CloudFront without it, every visitor at an edge would share one
  // address.
  it("refuses to run production without an origin secret", () => {
    expect(() => loadConfig({ ...env, STAGE: "production" })).toThrow(/ORIGIN_SECRET/);
    expect(
      loadConfig({ ...env, ORIGIN_SECRET: "s".repeat(32), STAGE: "production" }).originSecret,
    ).toBe("s".repeat(32));
  });

  it("points DynamoDB at another endpoint by env alone", () => {
    expect(loadConfig({ ...env, DYNAMODB_ENDPOINT: "http://127.0.0.1:8000" }).dynamodb).toEqual({
      endpoint: "http://127.0.0.1:8000",
      table: "acme",
    });
  });

  it("rejects a malformed endpoint", () => {
    expect(() => loadConfig({ ...env, DYNAMODB_ENDPOINT: "not a url" })).toThrow(
      /DYNAMODB_ENDPOINT/,
    );
  });
});

describe("loadConfig: email", () => {
  const on = {
    ...env,
    EMAIL: "on",
    EMAIL_FROM: "no-reply@dev.example.test",
    EMAIL_NOTICES_CONFIGURATION_SET: "acme-dev-notices",
    EMAIL_SITE_URL: "https://dev.example.test",
    EMAIL_TEAM_ADDRESS: "hello@example.test",
    EMAIL_TEAM_CONFIGURATION_SET: "acme-dev-team",
  };

  it("is off by default, and off when EMAIL says so whatever else is set", () => {
    expect(loadConfig(env).email).toBeUndefined();
    expect(loadConfig({ ...on, EMAIL: "off" }).email).toBeUndefined();
  });

  it("reads every setting when on", () => {
    expect(loadConfig(on).email).toEqual({
      configurationSets: { notices: "acme-dev-notices", team: "acme-dev-team" },
      from: "no-reply@dev.example.test",
      fromName: "Acme",
      neverMail: [],
      siteUrl: "https://dev.example.test",
      teamAddress: "hello@example.test",
    });
  });

  it("shows the sender as Acme unless EMAIL_FROM_NAME names the app", () => {
    expect(loadConfig({ ...on, EMAIL_FROM_NAME: "" }).email?.fromName).toBe("Acme");
    expect(loadConfig({ ...on, EMAIL_FROM_NAME: "Dinner Club" }).email?.fromName).toBe(
      "Dinner Club",
    );
  });

  // The name sits before `<address>` in the From header, so it may not hold
  // what that header's syntax reads.
  it.each([
    ["an angle bracket", "Acme <evil@example.test>"],
    ["a quote", 'Acme "Mail"'],
    ["a comma", "Acme, Inc"],
    ["a line break", "Acme\r\nBcc: x@example.test"],
    ["a line feed", "Acme\nBcc: x@example.test"],
    ["more than 64 characters", "A".repeat(65)],
  ])("refuses an EMAIL_FROM_NAME with %s", (_, name) => {
    expect(() => loadConfig({ ...on, EMAIL_FROM_NAME: name })).toThrow(/EMAIL_FROM_NAME/);
  });

  it("takes an EMAIL_FROM_NAME of exactly 64 characters", () => {
    expect(loadConfig({ ...on, EMAIL_FROM_NAME: "A".repeat(64) }).email?.fromName).toHaveLength(64);
  });

  it("fails at cold start when on with a setting missing, naming it", () => {
    expect(() => loadConfig({ ...on, EMAIL_FROM: undefined })).toThrow(/EMAIL_FROM/);
    expect(() => loadConfig({ ...on, EMAIL_TEAM_CONFIGURATION_SET: undefined })).toThrow(
      /EMAIL_TEAM_CONFIGURATION_SET/,
    );
  });

  it.each(["http://dev.example.test", "https://dev.example.test/app", "not a url"])(
    "MAIL-R11: refuses a site address that is not an https origin: %j",
    (value) => {
      expect(() => loadConfig({ ...on, EMAIL_SITE_URL: value })).toThrow(/EMAIL_SITE_URL/);
    },
  );

  it("names the domains never mailed, none when unset", () => {
    expect(loadConfig(on).email?.neverMail).toEqual([]);
    expect(
      loadConfig({ ...on, EMAIL_NEVER_MAIL_DOMAINS: "example.com,example.org" }).email?.neverMail,
    ).toEqual(["example.com", "example.org"]);
    expect(() => loadConfig({ ...on, EMAIL_NEVER_MAIL_DOMAINS: "a b" })).toThrow(
      /EMAIL_NEVER_MAIL_DOMAINS/,
    );
  });

  it("refuses an EMAIL that is neither on nor off", () => {
    expect(() => loadConfig({ ...on, EMAIL: "yes" })).toThrow(/EMAIL/);
  });
});

describe("loadDevConfig", () => {
  it("defaults the dev API to port 8787", () => {
    expect(loadDevConfig({})).toEqual({
      apiPort: 8787,
      ownerAddress: "owner@example.test",
      siteUrl: "http://localhost:3000",
    });
  });

  it("links dev's emails to DEV_SITE_URL, a preview's own web address", () => {
    expect(loadDevConfig({ DEV_SITE_URL: "http://localhost:3412/" }).siteUrl).toBe(
      "http://localhost:3412",
    );
  });

  it("takes the port from DEV_API_PORT, so previews can run side by side", () => {
    expect(loadDevConfig({ DEV_API_PORT: "4301" })).toMatchObject({ apiPort: 4301 });
  });

  it.each(["", "0", "65536", "80a", "4301.5"])("rejects DEV_API_PORT=%j", (value) => {
    expect(() => loadDevConfig({ DEV_API_PORT: value })).toThrow(/DEV_API_PORT/);
  });
});

// Skeleton: the demo's contact messages are mailed to this address.
describe("the skeleton's owner address", () => {
  it("is OWNER_EMAIL, and none when it is unset", () => {
    expect(loadConfig(env).ownerAddress).toBeUndefined();
    expect(loadConfig({ ...env, OWNER_EMAIL: "owner@example.com" }).ownerAddress).toBe(
      "owner@example.com",
    );
  });

  it("rejects an OWNER_EMAIL that is not an address", () => {
    expect(() => loadConfig({ ...env, OWNER_EMAIL: "owner" })).toThrow(/OWNER_EMAIL/);
  });

  it("defaults dev's to an example address, and takes DEV_OWNER_EMAIL", () => {
    expect(loadDevConfig({}).ownerAddress).toBe("owner@example.test");
    expect(loadDevConfig({ DEV_OWNER_EMAIL: "me@example.com" }).ownerAddress).toBe(
      "me@example.com",
    );
  });
});
