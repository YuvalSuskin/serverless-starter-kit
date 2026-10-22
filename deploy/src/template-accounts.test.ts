// Skeleton, TEMPLATE ONLY: what is true of the template's own deploy/accounts.json,
// shipped empty. `/bootstrap accounts` fills the file and DELETES THIS FILE
// (TB38); every behaviour that must keep holding afterwards is tested with
// injected configs in stage.test.ts and sst-script.test.ts.
import { describe, expect, it } from "vitest";

import { ACCOUNTS_FILE, NoAccountsError, requireAccount, stageSettings } from "./stage";

describe("the template's accounts.json (template only)", () => {
  it("ships empty: every value null", () => {
    expect(ACCOUNTS_FILE).toEqual({
      domain: null,
      region: null,
      stages: { dev: { account: null }, production: { account: null } },
    });
  });

  it("stops requireAccount with the message naming /bootstrap accounts", () => {
    expect(() => requireAccount("dev")).toThrow(NoAccountsError);
    expect(() => requireAccount("dev")).toThrow(/\/bootstrap accounts/);
  });

  it("gives every stage CloudFront's own address and no email", () => {
    expect(stageSettings("dev")).toMatchObject({ domain: undefined, email: false });
  });
});
