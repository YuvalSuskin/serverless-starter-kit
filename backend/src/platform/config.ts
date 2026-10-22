import * as z from "zod";

// The only file that reads the environment. Everything else gets
// a parsed Config. It fails fast, at cold start, on anything missing.
const EnvShape = z.object({
  DYNAMODB_ENDPOINT: z.url().optional(),
  LOG_LEVEL: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).default("INFO"),
  // The secret CloudFront and the site's server render send to the API.
  // A secret. Unset, the visitor's address
  // is the connection's: fine on a laptop, wrong behind CloudFront, so
  // production refuses to start without it.
  ORIGIN_SECRET: z.string().min(32).optional(),
  // Skeleton: where the demo's contact messages are mailed, replaced by
  // bootstrap step 6. Unset, they are stored and no mail is sent.
  OWNER_EMAIL: z.email().optional(),
  STAGE: z.string().min(1),
  TABLE_NAME: z.string().min(1),
});
const Env = EnvShape.refine(
  (env) => env.STAGE !== "production" || env.ORIGIN_SECRET !== undefined,
  {
    path: ["ORIGIN_SECRET"],
  },
);

// The stage's email: "off" by default; "on"
// needs every setting below, or the stage fails at cold start.
const EmailEnv = z.object({
  // The name the sender shows (`Acme <no-reply@…>`).
  // A display name sits before `<address>` in the From header, so nothing
  // that header syntax reads is allowed in it.
  EMAIL_FROM_NAME: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .regex(/^[^<>",;\\\r\n]{1,64}$/)
      .default("Acme"),
  ),
  EMAIL_FROM: z.email(),
  EMAIL_NOTICES_CONFIGURATION_SET: z.string().regex(/^[\w-]{1,64}$/),
  // Every link in an email starts with it (MAIL-R11): the stage's own address.
  EMAIL_SITE_URL: z.url().refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return url.protocol === "https:" && url.pathname === "/" && url.search === "";
  }),
  // Where a reply goes when it is the team's (MAIL-R6).
  EMAIL_TEAM_ADDRESS: z.email(),
  EMAIL_TEAM_CONFIGURATION_SET: z.string().regex(/^[\w-]{1,64}$/),
  // Domains never mailed, comma-separated: test accounts' (deploy/src/email.ts),
  // on the stages that have them. Absent, none.
  EMAIL_NEVER_MAIL_DOMAINS: z
    .string()
    .regex(/^[a-z\d.-]+(,[a-z\d.-]+)*$/)
    .optional(),
});

/** The stage's email. */
interface EmailConfig {
  configurationSets: { notices: string; team: string };
  /** The sender's address (MAIL-R2). */
  from: string;
  /** The sender's display name; `Acme` unless EMAIL_FROM_NAME says otherwise. */
  fromName: string;
  /** Domains whose addresses are never mailed (EMAIL_NEVER_MAIL_DOMAINS). */
  neverMail: string[];
  /** The stage's https origin, no trailing slash. */
  siteUrl: string;
  /** The team's mailbox, for replies (MAIL-R6). */
  teamAddress: string;
}

function loadEmailConfig(env: Record<string, string | undefined>): EmailConfig | undefined {
  const switched = z.enum(["on", "off"]).default("off").safeParse(env.EMAIL);
  if (!switched.success) throw new Error("Invalid configuration: EMAIL");
  if (switched.data === "off") return undefined;
  const e = parse(EmailEnv, env);
  return {
    configurationSets: {
      notices: e.EMAIL_NOTICES_CONFIGURATION_SET,
      team: e.EMAIL_TEAM_CONFIGURATION_SET,
    },
    from: e.EMAIL_FROM,
    fromName: e.EMAIL_FROM_NAME,
    neverMail: e.EMAIL_NEVER_MAIL_DOMAINS?.split(",") ?? [],
    siteUrl: new URL(e.EMAIL_SITE_URL).origin,
    teamAddress: e.EMAIL_TEAM_ADDRESS,
  };
}

export interface Config {
  dynamodb: { endpoint: string | undefined; table: string };
  /** Undefined on a stage whose email is off: nothing is sent (EM8). */
  email: EmailConfig | undefined;
  logLevel: "DEBUG" | "ERROR" | "INFO" | "WARN";
  /** Beside it, CloudFront-Viewer-Address is trusted. */
  originSecret: string | undefined;
  /** Skeleton: where the demo's contact messages are mailed (OWNER_EMAIL); undefined sends none. */
  ownerAddress: string | undefined;
  /** In a Lambda (Lambda names the function): the cold start primes the first request's work. */
  primeColdStart: boolean;
  stage: string;
}

/** Parses `env` with `schema`, failing fast and naming every field it lacks. */
function parse<T>(schema: z.ZodType<T>, env: Record<string, string | undefined>): T {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid configuration: ${fields}`);
  }
  return parsed.data;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const e = parse(Env, env);
  return {
    dynamodb: { endpoint: e.DYNAMODB_ENDPOINT, table: e.TABLE_NAME },
    email: loadEmailConfig(env),
    logLevel: e.LOG_LEVEL,
    originSecret: e.ORIGIN_SECRET,
    ownerAddress: e.OWNER_EMAIL,
    primeColdStart: Boolean(env.AWS_LAMBDA_FUNCTION_NAME),
    stage: e.STAGE,
  };
}

// The dev server's settings (`pnpm dev`, and each `pnpm preview`, which runs
// several at once). Never read in a Lambda.
const DevEnv = z.object({
  DEV_API_PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
  // Skeleton: where dev's contact messages are mailed; the fake mailer keeps
  // them at /api/dev-mail, so the default sends nothing anywhere.
  DEV_OWNER_EMAIL: z.email().default("owner@example.test"),
  // The site the dev server's emails link to:
  // `pnpm preview` passes each worktree's own web address.
  DEV_SITE_URL: z.url().default("http://localhost:3000"),
});

export interface DevConfig {
  apiPort: number;
  /** Skeleton: where dev's contact messages are mailed (to the fake mailbox). */
  ownerAddress: string;
  /** Where the links in dev's emails point. */
  siteUrl: string;
}

export function loadDevConfig(env: Record<string, string | undefined> = process.env): DevConfig {
  const parsed = DevEnv.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid dev configuration: ${fields}`);
  }
  return {
    apiPort: parsed.data.DEV_API_PORT,
    ownerAddress: parsed.data.DEV_OWNER_EMAIL,
    siteUrl: new URL(parsed.data.DEV_SITE_URL).origin,
  };
}
