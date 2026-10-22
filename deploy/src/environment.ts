// Skeleton: the API Lambda's environment, read by
// backend/src/platform/config.ts.

export interface ApiEnvironmentInput {
  /** The stage's email settings (src/email.ts `emailEnvironment`); absent, it sends none. */
  email?: Record<string, string>;
  originSecret: string;
  /**
   * Where the demo's contact messages are mailed: the stage's `OwnerEmail`
   * secret, set by the bootstrap. Empty or absent, a message is stored and no
   * mail is sent.
   */
  ownerEmail?: string;
  stage: string;
  table: string;
}

/**
 * A Lambda's whole environment must fit in 4 KB; SST adds a little of its own.
 * Past this, the deploy fails here, naming the cause, not in Lambda.
 */
export const MAX_API_ENVIRONMENT = 3584;

export function apiEnvironment(input: ApiEnvironmentInput): Record<string, string> {
  const environment = apiVariables(input);
  const size = Object.entries(environment).reduce((sum, [k, v]) => sum + k.length + v.length, 0);
  if (size > MAX_API_ENVIRONMENT) {
    throw new Error(
      `The API's environment is ${String(size)} characters: over ${String(MAX_API_ENVIRONMENT)}, near Lambda's 4 KB`,
    );
  }
  return environment;
}

function apiVariables(input: ApiEnvironmentInput): Record<string, string> {
  return {
    // The email channel: EMAIL=on and its settings, or nothing (off).
    ...input.email,
    LOG_LEVEL: "INFO",
    // A secret: in the function's configuration only.
    ORIGIN_SECRET: input.originSecret,
    ...(input.ownerEmail ? { OWNER_EMAIL: input.ownerEmail } : {}),
    STAGE: input.stage,
    TABLE_NAME: input.table,
  };
}

/** An API Gateway address ends with a slash; API_ORIGIN is an origin. */
export function originOf(url: string): string {
  return new URL(url).origin;
}
