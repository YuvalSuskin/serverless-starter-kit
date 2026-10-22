// The `/bootstrap` skill's progress: `.bootstrap/state.json`, committed, so it
// travels with the repo. Each finished step is recorded there; the skill
// resumes at `nextStep`. Pure functions: the CLI (state-cli.ts) reads and
// writes the file.

/** The seven steps, in the order they run (`.claude/skills/bootstrap/steps/<id>.md`). */
export const STEPS = [
  "1-basics",
  "2-product-brief",
  "3-owner-setup",
  "4-design-system",
  "5-scaffold",
  "6-replace-skeleton",
  "7-accounts",
] as const;

export type StepId = (typeof STEPS)[number];

/** Step 7 runs any time and may be deferred; every other step must be done. */
const OPTIONAL_STEP: StepId = "7-accounts";

export type StepStatus = "done" | "deferred";

interface StepRecord {
  status: StepStatus;
  /** The day it was recorded, YYYY-MM-DD. */
  date?: string;
}

export interface BootstrapState {
  steps: Partial<Record<StepId, StepRecord>>;
}

/** The state file holds something that is not a state; fix it by hand or from git. */
export class InvalidState extends Error {}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isStep = (id: string): id is StepId => (STEPS as readonly string[]).includes(id);
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseRecord(id: StepId, raw: unknown): StepRecord {
  if (!isObject(raw)) throw new InvalidState(`step ${id}: not an object`);
  const { date, status } = raw;
  if (status !== "done" && status !== "deferred") {
    throw new InvalidState(`step ${id}: status must be "done" or "deferred"`);
  }
  if (status === "deferred" && id !== OPTIONAL_STEP) {
    throw new InvalidState(`step ${id}: only ${OPTIONAL_STEP} can be deferred`);
  }
  if (date === undefined) return { status };
  if (typeof date !== "string" || !DATE.test(date)) {
    throw new InvalidState(`step ${id}: date must be YYYY-MM-DD`);
  }
  return { date, status };
}

/**
 * Reads a parsed `state.json`. No file (undefined) is a state with nothing
 * done; anything that is not a state throws `InvalidState` rather than being
 * guessed at, since a wrong guess would run a step twice.
 */
export function parseState(raw: unknown): BootstrapState {
  if (raw === undefined) return { steps: {} };
  if (!isObject(raw)) throw new InvalidState("the state is not a JSON object");
  const { steps = {} } = raw;
  if (!isObject(steps)) throw new InvalidState('"steps" is not an object');
  const parsed: BootstrapState["steps"] = {};
  for (const [id, record] of Object.entries(steps)) {
    if (!isStep(id)) throw new InvalidState(`"${id}" is not a bootstrap step`);
    parsed[id] = parseRecord(id, record);
  }
  return { steps: parsed };
}

/**
 * The step to run next: the first of steps 1 to 6 not done, then step 7
 * unless it is done or deferred; null when nothing is left.
 */
export function nextStep(state: unknown): StepId | null {
  const { steps } = parseState(state);
  const first = STEPS.find((id) => id !== OPTIONAL_STEP && steps[id]?.status !== "done");
  if (first !== undefined) return first;
  return steps[OPTIONAL_STEP] === undefined ? OPTIONAL_STEP : null;
}

/** A copy of the state with one step recorded. */
export function markStep(
  state: BootstrapState,
  step: StepId,
  status: StepStatus,
  date: string,
): BootstrapState {
  const record = parseRecord(step, { date, status });
  return { steps: { ...state.steps, [step]: record } };
}

/** A step by its id (`7-accounts`), its name (`accounts`) or its number (`7`). */
export function stepByName(name: string): StepId | undefined {
  return STEPS.find((id) => id === name || id.slice(2) === name || id.slice(0, 1) === name);
}
