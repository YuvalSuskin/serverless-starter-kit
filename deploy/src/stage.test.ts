import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ACCOUNTS_FILE,
  type AccountsConfig,
  accountStage,
  appRoleBoundary,
  awsProfile,
  awsTarget,
  NoAccountsError,
  requireAccount,
  stageSettings,
} from "./stage";

const EMPTY: AccountsConfig = {
  domain: null,
  region: null,
  stages: { dev: { account: null }, production: { account: null } },
};
const FILLED: AccountsConfig = {
  domain: "example.test",
  region: "eu-west-1",
  stages: { dev: { account: "111111111111" }, production: { account: "222222222222" } },
};

// deploy/accounts.json is the one place the accounts are written. These
// hold whether the file is empty or filled by `/bootstrap accounts`; what is
// true only of the template's empty file is in template-accounts.test.ts.
describe("accounts.json", () => {
  it("has the shape requireAccount reads: region, domain, and an account per stage, each text or null", () => {
    const file = JSON.parse(
      readFileSync(new URL("../accounts.json", import.meta.url), "utf8"),
    ) as AccountsConfig;
    const textOrNull = (value: unknown) => value === null || typeof value === "string";
    expect(Object.keys(file).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "domain",
      "region",
      "stages",
    ]);
    expect(Object.keys(file.stages).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "dev",
      "production",
    ]);
    expect(
      [file.region, file.domain, file.stages.dev.account, file.stages.production.account].every(
        textOrNull,
      ),
    ).toBe(true);
    expect(ACCOUNTS_FILE).toEqual(file);
  });
});

describe("requireAccount", () => {
  it("stops with a message naming /bootstrap accounts when the file is empty", () => {
    expect(() => requireAccount("dev", EMPTY)).toThrow(NoAccountsError);
    expect(() => requireAccount("dev", EMPTY)).toThrow(/\/bootstrap accounts/);
    expect(() => requireAccount("production", EMPTY)).toThrow(/\/bootstrap accounts/);
  });

  it("says in one line which stage has no account", () => {
    let message = "";
    try {
      requireAccount("production", EMPTY);
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }
    expect(message).not.toContain("\n");
    expect(message).toContain("deploy/accounts.json");
    expect(message).toContain('"production"');
    expect(message).toContain("/bootstrap accounts");
  });

  it("returns a stage's account and the region once the file is filled", () => {
    expect(requireAccount("dev", FILLED)).toEqual({ account: "111111111111", region: "eu-west-1" });
    expect(requireAccount("production", FILLED)).toEqual({
      account: "222222222222",
      region: "eu-west-1",
    });
  });

  it("needs the stage's own account: dev filled, production empty, stops for production only", () => {
    const devOnly = { ...FILLED, stages: { ...FILLED.stages, production: { account: null } } };
    expect(requireAccount("dev", devOnly).account).toBe("111111111111");
    expect(() => requireAccount("production", devOnly)).toThrow(NoAccountsError);
  });

  it("needs the region too", () => {
    expect(() => requireAccount("dev", { ...FILLED, region: null })).toThrow(NoAccountsError);
    expect(() => requireAccount("dev", { ...FILLED, region: "" })).toThrow(/\/bootstrap accounts/);
  });

  it("refuses an account that is not twelve digits, and a region that is not one", () => {
    const account = (id: string) => ({
      ...FILLED,
      stages: { ...FILLED.stages, dev: { account: id } },
    });
    expect(() => requireAccount("dev", account("1234"))).toThrow(/12 digits/);
    expect(() => requireAccount("dev", { ...FILLED, region: "Tel Aviv" })).toThrow(/region/);
  });

  it("needs no domain: it is optional", () => {
    expect(requireAccount("dev", { ...FILLED, domain: null }).region).toBe("eu-west-1");
  });
});

// `pnpm typegen` (`sst install`) evaluates sst.config.ts's app() only to
// download SST's provider code; it must work before any account exists.
describe("awsTarget", () => {
  it("is requireAccount's answer for the stage's account", () => {
    expect(awsTarget("dev", {}, FILLED)).toEqual({ account: "111111111111", region: "eu-west-1" });
    expect(awsTarget("production", {}, FILLED).account).toBe("222222222222");
    expect(awsTarget("t-1", {}, FILLED).account).toBe("111111111111");
  });

  it("stops with an empty file, as requireAccount does", () => {
    expect(() => awsTarget("dev", {}, EMPTY)).toThrow(NoAccountsError);
  });

  it("names no account while typegen installs the providers, whatever the file holds", () => {
    expect(awsTarget("ci", { ACME_TYPEGEN: "1" }, EMPTY)).toEqual({
      account: undefined,
      region: "us-east-1",
    });
    expect(awsTarget("ci", { ACME_TYPEGEN: "1" }, FILLED).account).toBeUndefined();
  });

  it("is what the typegen script sets", () => {
    const { scripts } = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(scripts.typegen).toBe("ACME_TYPEGEN=1 sst install --stage ci");
  });
});

describe("accountStage", () => {
  it("puts only production in the production account; everything else in dev's", () => {
    expect(accountStage("production")).toBe("production");
    for (const stage of ["dev", "prod", "staging", "pr-12"]) {
      expect(accountStage(stage)).toBe("dev");
    }
  });
});

describe("stageSettings", () => {
  it("production: protected, retained, no basic auth, at the domain, mailing from it", () => {
    expect(stageSettings("production", FILLED)).toEqual({
      basicAuth: false,
      domain: { name: "example.test", redirects: ["www.example.test"] },
      email: true,
      production: true,
      protect: true,
      removal: "retain",
      tableDeletionProtection: true,
    });
  });

  it("dev: protected from sst remove, its table refusing deletion, at dev.<domain>", () => {
    expect(stageSettings("dev", FILLED)).toEqual({
      basicAuth: true,
      domain: { name: "dev.example.test", redirects: [] },
      email: true,
      production: false,
      protect: true,
      removal: "retain",
      tableDeletionProtection: true,
    });
  });

  it("a throwaway stage: nothing stops sst remove, no domain of its own, no email", () => {
    expect(stageSettings("t-59o-3", FILLED)).toEqual({
      basicAuth: true,
      domain: undefined,
      email: false,
      production: false,
      protect: false,
      removal: "remove",
      tableDeletionProtection: false,
    });
  });

  it("with no domain, every stage is served at CloudFront's own address and sends no email", () => {
    for (const stage of ["dev", "production", "t-1"]) {
      const settings = stageSettings(stage, { ...FILLED, domain: null });
      expect(settings.domain).toBeUndefined();
      expect(settings.email).toBe(false);
    }
  });

  it("reads accounts.json by default", () => {
    expect(stageSettings("dev")).toEqual(stageSettings("dev", ACCOUNTS_FILE));
  });

  it("refuses a stage name AWS resource names cannot carry", () => {
    for (const stage of ["Dev", "1dev", "dev_x", "", "a".repeat(32)]) {
      expect(() => stageSettings(stage, FILLED)).toThrow(/Stage/);
    }
  });
});

describe("appRoleBoundary", () => {
  it("is the account's one boundary policy", () => {
    expect(appRoleBoundary("111111111111")).toBe(
      "arn:aws:iam::111111111111:policy/acme-app-role-boundary",
    );
  });

  it("matches the template's policy name", () => {
    const template = readFileSync(
      new URL("../../infra/aws/github-deploy.yaml", import.meta.url),
      "utf8",
    );
    expect(template).toContain("ManagedPolicyName: acme-app-role-boundary\n");
    expect(template).toContain(
      "iam:PermissionsBoundary: !Sub arn:aws:iam::${AWS::AccountId}:policy/acme-app-role-boundary\n",
    );
  });
});

describe("awsProfile", () => {
  it("uses the stage account's profile on a laptop", () => {
    expect(awsProfile("dev", {})).toBe("acme-dev");
    expect(awsProfile("t-1", {})).toBe("acme-dev");
    expect(awsProfile("production", { GITHUB_ACTIONS: "false" })).toBe("acme-prod");
  });

  it("uses the environment's credentials in GitHub Actions, where there are no profiles", () => {
    expect(awsProfile("dev", { GITHUB_ACTIONS: "true" })).toBeUndefined();
  });
});
