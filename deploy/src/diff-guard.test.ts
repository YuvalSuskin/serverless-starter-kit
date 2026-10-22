import { describe, expect, it } from "vitest";

import { changeLines, diffProblems, type GuardOptions } from "./diff-guard";

const DEV: GuardOptions = { keepsData: true, firstDeploy: false };

// The shape of `sst diff --stage dev` written to a file (no TTY), trimmed
// from a real run on 2026-10-07: progress lines start with "|", the plan's
// summary with "+", "*" or "-", property lines are indented.
function diffOutput(...changes: string[]): string {
  return [
    "SST 4.17.1 ready!",
    "➜  App:        acme",
    "   Stage:      dev",
    "~  Diff",
    "|  Created     WebBuild command:local:Command",
    "|  Deleted     WebServer sst:aws:Function → WebServerFunction aws:lambda:Function",
    "✓  Generated    ",
    "   Cdn: https://d12dfx3xsz1vt0.cloudfront.net",
    "   ---",
    "   url: https://d12dfx3xsz1vt0.cloudfront.net",
    "+  WebBuild command:local:Command",
    "   * dir = /home/runner/work/acme/acme/frontend",
    "*  WebServerLinkRef sst:sst:LinkRef",
    "-  WebServer sst:aws:Function → WebServerFunction aws:lambda:Function",
    "-  WebServer sst:aws:Function → WebServerCode aws:s3:BucketObjectv2",
    ...changes,
  ].join("\n");
}

describe("diffProblems", () => {
  it("passes every dev diff's known noise: the site's server function shown as deleted", () => {
    expect(diffProblems(diffOutput(), "dev", DEV)).toEqual([]);
  });

  it.each([
    ["-  Data sst:aws:Dynamo → DataTable aws:dynamodb:Table"],
    ["-  Data sst:aws:Dynamo"],
    ["|  Deleted     Data sst:aws:Dynamo → DataTable aws:dynamodb:Table"],
    ["|  Deleting    Data sst:aws:Dynamo → DataTable aws:dynamodb:Table"],
  ])("refuses a delete of a resource that holds data: %s", (line) => {
    const problems = diffProblems(diffOutput(line), "dev", DEV);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("delete");
  });

  it.each([
    ["+-  Data sst:aws:Dynamo → DataTable aws:dynamodb:Table"],
    ["-+  Data sst:aws:Dynamo → DataTable aws:dynamodb:Table"],
    ["±  Data sst:aws:Dynamo"],
    ["~  Data sst:aws:Dynamo → DataTable aws:dynamodb:Table"],
    ["|  Replaced    Data sst:aws:Dynamo → DataTable aws:dynamodb:Table"],
    ["|  Replacing   Data sst:aws:Dynamo → DataTable aws:dynamodb:Table"],
  ])("refuses a replace of a resource that holds data: %s", (line) => {
    const problems = diffProblems(diffOutput(line), "dev", DEV);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("replace");
  });

  it("names every refused line once per line, progress and summary alike", () => {
    const problems = diffProblems(
      diffOutput(
        "|  Deleted     Data sst:aws:Dynamo → DataTable aws:dynamodb:Table",
        "-  Data sst:aws:Dynamo",
        "-  Data sst:aws:Dynamo → DataTable aws:dynamodb:Table",
      ),
      "dev",
      DEV,
    );
    expect(problems).toHaveLength(3);
  });

  it("lets through updates of protected resources", () => {
    expect(
      diffProblems(
        diffOutput(
          "*  Data sst:aws:Dynamo → DataTable aws:dynamodb:Table",
          "|  Updated     Data sst:aws:Dynamo → DataTable aws:dynamodb:Table",
          "|  Updating    Data sst:aws:Dynamo → DataTable aws:dynamodb:Table",
        ),
        "dev",
        DEV,
      ),
    ).toEqual([]);
  });

  it("refuses an unknown marker on a protected resource: the guard reads only what it knows", () => {
    const problems = diffProblems(
      diffOutput("?  Data sst:aws:Dynamo", "|  Imported    Data sst:aws:Dynamo"),
      "dev",
      DEV,
    );
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('"?" (not an update)');
  });

  const creates = [
    "+  Data sst:aws:Dynamo → DataTable aws:dynamodb:Table",
    "|  Created     Data sst:aws:Dynamo → DataTable aws:dynamodb:Table",
  ];

  it("refuses a create of a protected resource on a stage that keeps data: its old one is lost", () => {
    const problems = diffProblems(diffOutput(...creates), "dev", DEV);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("create of DataTable");
  });

  it("lets the creates through on that stage's first deploy, and on a throwaway stage", () => {
    const first = { keepsData: true, firstDeploy: true };
    expect(diffProblems(diffOutput(...creates), "dev", first)).toEqual([]);
    const throwaway = diffOutput(...creates).replace("Stage:      dev", "Stage:      t59o4");
    expect(diffProblems(throwaway, "t59o4", { keepsData: false, firstDeploy: false })).toEqual([]);
  });

  it("lets through a delete of a child that holds no data, and of unprotected resources", () => {
    expect(
      diffProblems(
        diffOutput(
          "-  WebAssets sst:aws:Bucket → WebAssetsBucket aws:s3:BucketV2",
          "-  WebAssets sst:aws:Bucket → WebAssetsPolicy aws:s3:BucketPolicy",
          "-  DataExport sst:aws:Dynamo → DataExportTable aws:dynamodb:Table",
          "-  Api sst:aws:Function → ApiFunction aws:lambda:Function",
        ),
        "dev",
        DEV,
      ),
    ).toEqual([]);
  });

  it("ignores property lines, even ones that name a protected resource", () => {
    expect(diffProblems(diffOutput("   - Data = old", "   - DataTable = old"), "dev", DEV)).toEqual(
      [],
    );
  });

  it("reads coloured output", () => {
    const coloured = diffOutput(
      "\u001B[31m-  Data sst:aws:Dynamo → DataTable aws:dynamodb:Table\u001B[0m",
    );
    expect(diffProblems(coloured, "dev", DEV)).toHaveLength(1);
  });

  it("fails closed when the output is not a finished plan for this stage", () => {
    expect(diffProblems("", "dev", DEV)[0]).toContain("unreadable");
    expect(diffProblems(diffOutput(), "production", DEV)[0]).toContain("unreadable");
    const unfinished = diffOutput().replace("✓  Generated", "✕  Failed");
    expect(diffProblems(unfinished, "dev", DEV)[0]).toContain("unreadable");
  });
});

// Captured on a throwaway stage with the table renamed (a replace): SST's
// summary shows the table's replacement only as a create; its progress lines
// show the delete.
const REAL_REPLACE = [
  "SST 4.17.1 ready!",
  "   Stage:      t59o4",
  "~  Diff",
  "|  Deleted     Data sst:aws:Dynamo → DataTable aws:dynamodb:Table",
  "|  Created     Data sst:aws:Dynamo → DataTable aws:dynamodb:Table",
  "✓  Generated    ",
  "+  Data sst:aws:Dynamo → DataTable aws:dynamodb:Table",
  "   * name = acme-t59o4-guard-test",
].join("\n");

describe("diffProblems on a real replace (t59o4)", () => {
  it("refuses it on a throwaway stage by its progress line's delete", () => {
    const problems = diffProblems(REAL_REPLACE, "t59o4", { keepsData: false, firstDeploy: false });
    expect(problems).toEqual([
      "Refused, delete of DataTable: |  Deleted     Data sst:aws:Dynamo → DataTable aws:dynamodb:Table",
    ]);
  });

  it("refuses it on a stage that keeps data by the create as well", () => {
    const onDev = REAL_REPLACE.replace("Stage:      t59o4", "Stage:      dev");
    expect(diffProblems(onDev, "dev", DEV)).toHaveLength(3);
  });
});

describe("diffProblems on shapes not seen yet", () => {
  it("finds a data component nested inside another", () => {
    const nested =
      "-  WebServer sst:aws:Function → Data sst:aws:Dynamo → DataTable aws:dynamodb:Table";
    expect(diffProblems(diffOutput(nested), "dev", DEV)).toHaveLength(1);
  });

  it("reads a resource line that starts with spaces", () => {
    expect(
      diffProblems(
        diffOutput("  -  Data sst:aws:Dynamo → DataTable aws:dynamodb:Table"),
        "dev",
        DEV,
      ),
    ).toHaveLength(1);
  });
});

describe("changeLines", () => {
  it("lists the plan's summary lines without property values", () => {
    expect(changeLines(diffOutput())).toEqual([
      "+  WebBuild command:local:Command",
      "*  WebServerLinkRef sst:sst:LinkRef",
      "-  WebServer sst:aws:Function → WebServerFunction aws:lambda:Function",
      "-  WebServer sst:aws:Function → WebServerCode aws:s3:BucketObjectv2",
    ]);
  });
});
