import { describe, expect, it } from "vitest";

import { loadConfig } from "../../backend/src/platform/config.ts";
import { emailEnvironment, emailPlan } from "./email";
import { apiEnvironment, MAX_API_ENVIRONMENT, originOf } from "./environment";
import { type AccountsConfig, stageSettings } from "./stage";

const input = {
  originSecret: "o".repeat(40),
  stage: "dev",
  table: "the-table",
};

describe("apiEnvironment", () => {
  it("is a configuration the backend accepts", () => {
    const config = loadConfig(apiEnvironment(input));
    expect(config.stage).toBe("dev");
    expect(config.dynamodb).toEqual({ endpoint: undefined, table: "the-table" });
    expect(config.originSecret).toBe("o".repeat(40));
  });

  it("is a configuration production accepts: it needs the origin secret, which every stage gets", () => {
    expect(loadConfig(apiEnvironment({ ...input, stage: "production" })).stage).toBe("production");
  });

  // The skeleton mails the owner; the address is a bootstrap answer (the
  // stage's OwnerEmail secret), empty until then.
  it("gives the API the owner's address when the stage has one, and nothing when empty", () => {
    expect(
      loadConfig(apiEnvironment({ ...input, ownerEmail: "owner@example.test" })).ownerAddress,
    ).toBe("owner@example.test");
    expect(apiEnvironment({ ...input, ownerEmail: "" })).not.toHaveProperty("OWNER_EMAIL");
    expect(loadConfig(apiEnvironment({ ...input, ownerEmail: "" })).ownerAddress).toBeUndefined();
    expect(loadConfig(apiEnvironment(input)).ownerAddress).toBeUndefined();
  });

  it("fails the deploy, not the Lambda, when the environment outgrows Lambda's 4 KB", () => {
    expect(() =>
      apiEnvironment({ ...input, email: { EMAIL_BIG: "x".repeat(MAX_API_ENVIRONMENT) } }),
    ).toThrow(/over 3584/);
  });
});

// The sending identity follows `domain` in deploy/accounts.json.
describe("email", () => {
  const filled: AccountsConfig = {
    domain: "example.test",
    region: "eu-west-1",
    stages: { dev: { account: "111111111111" }, production: { account: "222222222222" } },
  };

  it("sends none by default", () => {
    expect(apiEnvironment(input)).not.toHaveProperty("EMAIL");
    expect(loadConfig(apiEnvironment(input)).email).toBeUndefined();
  });

  it("is a configuration the backend accepts once on", () => {
    const plan = emailPlan("dev", stageSettings("dev", filled), "eu-west-1");
    if (!plan) throw new Error("no plan");
    const config = loadConfig(
      apiEnvironment({ ...input, email: emailEnvironment(plan, "https://d1.cloudfront.net") }),
    );
    expect(config.email).toEqual({
      configurationSets: { notices: "acme-dev-notices", team: "acme-dev-team" },
      from: "no-reply@dev.example.test",
      fromName: "Acme",
      neverMail: [],
      siteUrl: "https://d1.cloudfront.net",
      teamAddress: "hello@dev.example.test",
    });
  });
});

describe("originOf", () => {
  it("is the origin of an API Gateway address, without its trailing slash", () => {
    expect(originOf("https://abc.execute-api.eu-west-1.amazonaws.com/")).toBe(
      "https://abc.execute-api.eu-west-1.amazonaws.com",
    );
  });
});
