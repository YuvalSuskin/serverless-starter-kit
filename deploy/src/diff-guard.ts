// Skeleton: reads `sst diff`'s output before a deploy and refuses one that
// would lose data (the runbook's stop list). The pipeline runs it between the
// diff and the deploy; agents run it on their own diff (`pnpm diff-guard`).

/**
 * The components that hold data, and the child that holds it. A line about
 * either may only update it (or create it, on a stage that keeps data, only
 * on its first deploy). Their other children (CORS, a policy) hold nothing.
 * A resource that gains data (a bucket of users' files, a user pool) is added
 * here when it is declared in sst.config.ts.
 */
const PROTECTED: Readonly<Record<string, string | undefined>> = {
  Data: "DataTable",
};
const DATA_CHILDREN = new Set(Object.values(PROTECTED).filter((child) => child !== undefined));

// A resource's type, after its name: "provider:module:Type" (sst:aws:Bucket,
// aws:s3:BucketV2, command:local:Command).
const TYPE = /^[\w-]+:[\w/-]*:\w+$/;
// Terminal colours, in case SST writes them.
const COLOUR = /\u001B\[[0-9;]*m/g;
// A property of the resource above it: indented, then "* name = value"
// (for the summary only; the guard reads every line that names a resource).
const PROPERTY = /^\s+[*+-]\s/;

const CREATE = new Set(["+", "Created", "Creating"]);
const UPDATE = new Set(["*", "Updated", "Updating", "Same"]);

export interface GuardOptions {
  /** The stage keeps data (`protect` in stage settings: dev, production): a create means its data is gone. */
  keepsData: boolean;
  /** The stage's very first deploy, when creating its data resources is expected. */
  firstDeploy: boolean;
}

function lines(output: string): string[] {
  return output.replace(COLOUR, "").split("\n");
}

/** The names of the resources on a line: each word followed by a type. */
function resourcesOn(line: string): string[] {
  const words = line.trim().split(/\s+/);
  return words.flatMap((word, i) => (i > 0 && TYPE.test(word) ? [words[i - 1] ?? ""] : []));
}

/** The protected resource a line is about, if any. */
function protectedResource(line: string): string | undefined {
  const names = resourcesOn(line);
  // A data-holding child anywhere on the line (a component may sit inside
  // another: "Parent … → Data … → DataTable …").
  const child = names.find((name) => DATA_CHILDREN.has(name));
  if (child !== undefined) return child;
  // Otherwise the resource the line is about, its last name: a protected
  // component itself ("Data sst:aws:Dynamo", "UserPool aws:cognito:UserPool"),
  // not one of its children that hold nothing ("Uploads … → UploadsCors …").
  const last = names.at(-1);
  return last !== undefined && Object.hasOwn(PROTECTED, last) ? last : undefined;
}

/** "+", "-", "*"… for the plan's summary; "Created", "Deleted"… for SST's progress lines. */
function operation(line: string): string {
  const [first = "", second = ""] = line.trim().split(/\s+/);
  return first === "|" ? second : first;
}

/** What a refused operation is, in words; anything unknown is named as it was shown. */
function named(op: string): string {
  if (op === "-" || /^delet/i.test(op)) return "delete";
  if (["±", "+-", "-+", "~"].includes(op) || /replac/i.test(op)) return "replace";
  return `"${op}" (not an update)`;
}

function finishedPlan(all: string[], stage: string): boolean {
  const forStage = all.some((line) => line.trim().split(/\s+/).join(" ") === `Stage: ${stage}`);
  const finished = all.some((line) => /^\S*\s*Generated\b/.test(line.trim()));
  return forStage && finished;
}

/**
 * What stops the deploy: one message per line about a protected resource
 * that does anything but update it (a delete, a replace, an unknown marker),
 * or creates it on a stage that keeps data, after its first deploy. Output
 * that is not a finished plan of this stage is refused as unreadable.
 */
export function diffProblems(output: string, stage: string, options: GuardOptions): string[] {
  const all = lines(output);
  if (!finishedPlan(all, stage)) {
    return [`The diff is unreadable: no finished plan for stage "${stage}". Read it by hand.`];
  }
  const problems: string[] = [];
  for (const line of all) {
    // Property lines name no resource type, so they never match here.
    const resource = protectedResource(line);
    if (resource === undefined) continue;
    const op = operation(line);
    if (UPDATE.has(op)) continue;
    if (CREATE.has(op)) {
      if (!options.keepsData || options.firstDeploy) continue;
      problems.push(
        `Refused, create of ${resource} on a stage that keeps data (its old one is gone from SST's state?): ${line.trim()}`,
      );
      continue;
    }
    problems.push(`Refused, ${named(op)} of ${resource}: ${line.trim()}`);
  }
  return problems;
}

/** The plan's summary lines (after "Generated"), without property values: for the job summary. */
export function changeLines(output: string): string[] {
  const all = lines(output);
  const start = all.findIndex((line) => /^\S*\s*Generated\b/.test(line.trim()));
  if (start === -1) return [];
  return all
    .slice(start + 1)
    .filter((line) => !PROPERTY.test(line) && !line.startsWith("|") && resourcesOn(line).length > 0)
    .map((line) => line.trimEnd());
}
