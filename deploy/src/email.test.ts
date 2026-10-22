import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  configurationSetArgs,
  DNS_RECORD_COUNT,
  dnsRecords,
  emailEnvironment,
  emailPermissions,
  emailPlan,
} from "./email";
import { type AccountsConfig, stageSettings } from "./stage";

const FILLED: AccountsConfig = {
  domain: "example.test",
  region: "eu-west-1",
  stages: { dev: { account: "111111111111" }, production: { account: "222222222222" } },
};
const REGION = "eu-west-1";
const plan = (stage: string) => {
  const found = emailPlan(stage, stageSettings(stage, FILLED), REGION);
  if (!found) throw new Error("no plan");
  return found;
};

// The sending identity follows `domain` in deploy/accounts.json.
describe("a stage's email", () => {
  it("a stage without a domain of its own sends none: a throwaway stage, or any stage with no domain", () => {
    expect(emailPlan("bead-x1", stageSettings("bead-x1", FILLED), REGION)).toBeUndefined();
    expect(
      emailPlan("dev", stageSettings("dev", { ...FILLED, domain: null }), REGION),
    ).toBeUndefined();
  });

  it("dev sends from dev.<domain>, production from <domain>, each MAIL FROM off the apex", () => {
    expect(plan("dev")).toEqual({
      configurationSets: { notices: "acme-dev-notices", team: "acme-dev-team" },
      domain: "dev.example.test",
      from: "no-reply@dev.example.test",
      mailFrom: "mail.dev.example.test",
      region: REGION,
      sandbox: true,
    });
    expect(plan("production")).toMatchObject({
      domain: "example.test",
      from: "no-reply@example.test",
      mailFrom: "mail.example.test",
      sandbox: false,
    });
  });

  it("the team set suppresses bounces and complaints, the notices set bounces only", () => {
    expect(configurationSetArgs(plan("dev"), "team").suppressionOptions.suppressedReasons).toEqual([
      "BOUNCE",
      "COMPLAINT",
    ]);
    expect(
      configurationSetArgs(plan("dev"), "notices").suppressionOptions.suppressedReasons,
    ).toEqual(["BOUNCE"]);
  });

  it("neither set tracks opens or clicks", () => {
    for (const stream of ["team", "notices"] as const) {
      const args = configurationSetArgs(plan("dev"), stream);
      expect(args.vdmOptions.dashboardOptions.engagementMetrics).toBe("DISABLED");
      expect(args).not.toHaveProperty("trackingOptions");
    }
  });

  it("verifies the domain inside its own zone, never at the apex's mail records", () => {
    const records = dnsRecords(plan("production"), ["t1", "t2", "t3"]);
    expect(records).toHaveLength(DNS_RECORD_COUNT);
    expect(records).toContainEqual({
      name: "t1._domainkey.example.test",
      records: ["t1.dkim.eu-west-1.amazonses.com"],
      type: "CNAME",
    });
    expect(records).toContainEqual({
      name: "mail.example.test",
      records: ["10 feedback-smtp.eu-west-1.amazonses.com"],
      type: "MX",
    });
    expect(records.some((record) => record.name === "example.test")).toBe(false);
  });

  it("grants SendEmail on the stage's identity and sets; a sandbox stage also on its account's identities", () => {
    expect(emailPermissions(plan("production"), "222222222222")).toEqual([
      {
        actions: ["ses:SendEmail"],
        resources: [
          "arn:aws:ses:eu-west-1:222222222222:identity/example.test",
          "arn:aws:ses:eu-west-1:222222222222:configuration-set/acme-production-team",
          "arn:aws:ses:eu-west-1:222222222222:configuration-set/acme-production-notices",
        ],
      },
    ]);
    expect(emailPermissions(plan("dev"), "111111111111")[0]?.resources[0]).toBe(
      "arn:aws:ses:eu-west-1:111111111111:identity/*",
    );
  });

  // infra/aws/github-deploy.yaml: the boundary lets an app role send through
  // any stage's sets, and the deploy role manages its own stage's, so the
  // names here must stay inside both patterns.
  it("names the sets inside the template's boundary and deploy role patterns", () => {
    const template = readFileSync(
      new URL("../../infra/aws/github-deploy.yaml", import.meta.url),
      "utf8",
    );
    expect(template).toContain(
      "- !Sub arn:aws:ses:${AWS::Region}:${AWS::AccountId}:configuration-set/acme-*\n",
    );
    expect(template).toContain(
      "- !Sub arn:aws:ses:${AWS::Region}:${AWS::AccountId}:configuration-set/acme-${Stage}-*\n",
    );
    for (const stage of ["dev", "production"]) {
      for (const name of Object.values(plan(stage).configurationSets)) {
        expect(name.startsWith(`acme-${stage}-`)).toBe(true);
      }
    }
  });

  it("gives the API every setting its config needs, with the site's origin", () => {
    expect(emailEnvironment(plan("dev"), "https://d1234.cloudfront.net/")).toEqual({
      EMAIL: "on",
      EMAIL_FROM: "no-reply@dev.example.test",
      EMAIL_NOTICES_CONFIGURATION_SET: "acme-dev-notices",
      EMAIL_SITE_URL: "https://d1234.cloudfront.net",
      EMAIL_TEAM_ADDRESS: "hello@dev.example.test",
      EMAIL_TEAM_CONFIGURATION_SET: "acme-dev-team",
    });
  });
});
