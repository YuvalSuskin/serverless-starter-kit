import { describe, expect, it } from "vitest";

import { apiPermissions, cloudfrontReadPolicy } from "./permissions";

describe("apiPermissions", () => {
  const permissions = apiPermissions("arn:table");
  const actions = permissions.flatMap((p) => p.actions);

  it("grants item actions, never a wildcard or a control-plane action", () => {
    expect(actions.some((a) => a.endsWith("*"))).toBe(false);
    for (const forbidden of ["dynamodb:UpdateTable", "dynamodb:DeleteTable"]) {
      expect(actions).not.toContain(forbidden);
    }
  });

  it("covers the table and its indexes, and nothing else", () => {
    expect(permissions).toHaveLength(1);
    expect(permissions[0]?.resources).toEqual(["arn:table", "arn:table/index/*"]);
  });
});

describe("cloudfrontReadPolicy", () => {
  it("lets only this stage's distribution read the bucket", () => {
    expect(cloudfrontReadPolicy("arn:aws:cloudfront::1:distribution/E1")).toEqual({
      actions: ["s3:GetObject"],
      conditions: [
        {
          test: "StringEquals",
          values: ["arn:aws:cloudfront::1:distribution/E1"],
          variable: "AWS:SourceArn",
        },
      ],
      paths: ["*"],
      principals: [{ identifiers: ["cloudfront.amazonaws.com"], type: "service" }],
    });
  });
});
