// Skeleton: everything that differs by stage, and the accounts the stages
// deploy to. The only place a stage name is compared: sst.config.ts reads
// these settings and nothing else.
//
// The accounts, the region and the domain are written once, in
// deploy/accounts.json, by `/bootstrap accounts`. Until then the file is
// empty and every deploy command stops with a message that says so.
import { readFileSync } from "node:fs";

import accounts from "../accounts.json" with { type: "json" };

/** The shape of deploy/accounts.json; every value is null until the bootstrap fills it. */
export interface AccountsConfig {
  /** The domain the project is served at, or null: stages then use CloudFront's own address. */
  domain: string | null;
  /** The one AWS region everything runs in. */
  region: string | null;
  stages: Record<StageName, { account: string | null }>;
}

/** The two accounts a stage can land in; every other stage is a throwaway one in dev's. */
export type StageName = "dev" | "production";

export const ACCOUNTS_FILE: AccountsConfig = accounts;

/**
 * The accounts the deploy scripts check. `ACME_ACCOUNTS_FILE` points them at
 * another file; the tests use it so none depends on what the shipped file holds.
 */
export function accountsFile(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AccountsConfig {
  const path = env.ACME_ACCOUNTS_FILE;
  return path ? (JSON.parse(readFileSync(path, "utf8")) as AccountsConfig) : ACCOUNTS_FILE;
}

/** Stops a deploy that has no account to go to; names the step that sets it up. */
export class NoAccountsError extends Error {
  constructor(subject: string) {
    super(`deploy/accounts.json has no ${subject}: run /bootstrap accounts to fill it in`);
    this.name = "NoAccountsError";
  }
}

const ACCOUNT_ID = /^\d{12}$/;
const REGION = /^[a-z]{2}(?:-[a-z]+)+-\d$/;

/**
 * A stage's AWS account and the project's region, from accounts.json. Throws
 * `NoAccountsError` while either is empty, and a plain error for a value that
 * cannot be one.
 */
export function requireAccount(
  stage: StageName,
  config: AccountsConfig = ACCOUNTS_FILE,
): { account: string; region: string } {
  const { region } = config;
  const account = config.stages[stage].account;
  if (!account) throw new NoAccountsError(`account for stage "${stage}"`);
  if (!region) throw new NoAccountsError("region");
  if (!ACCOUNT_ID.test(account)) {
    throw new Error(`deploy/accounts.json: the account of stage "${stage}" must be 12 digits`);
  }
  if (!REGION.test(region)) {
    throw new Error(`deploy/accounts.json: "${region}" is not an AWS region (such as eu-west-1)`);
  }
  return { account, region };
}

/**
 * The account and region SST's AWS provider is pointed at for a stage. While
 * `pnpm typegen` runs (`ACME_TYPEGEN=1`), SST only downloads provider code
 * and evaluates the config's app() with no account in mind, so it names none:
 * `sst install` must work before the accounts step has run.
 */
export function awsTarget(
  stage: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
  config: AccountsConfig = ACCOUNTS_FILE,
): { account: string | undefined; region: string } {
  if (env.ACME_TYPEGEN === "1") return { account: undefined, region: config.region ?? "us-east-1" };
  return requireAccount(accountStage(stage), config);
}

/**
 * Whether the file holds anything a deploy can use: the region and at least
 * one stage's account. The package scripts run it before they build anything;
 * `requireAccount` then checks the stage being deployed.
 */
export function requireAnyAccount(config: AccountsConfig = ACCOUNTS_FILE): void {
  const hasAccount = [config.stages.dev.account, config.stages.production.account].some(Boolean);
  if (!config.region && !hasAccount) throw new NoAccountsError("accounts");
  if (!config.region) throw new NoAccountsError("region");
  if (!hasAccount) throw new NoAccountsError("account for any stage");
}

/** The account a stage lands in: production's own, and dev's for every other stage. */
export function accountStage(stage: string): StageName {
  return stage === "production" ? "production" : "dev";
}

interface DomainSetting {
  name: string;
  /** Addresses that redirect to `name`. */
  redirects: string[];
}

export interface StageSettings {
  /** Basic auth in front of every path: every stage but production. */
  basicAuth: boolean;
  /** The stage's public address: production at the domain, dev at dev.<domain>, a throwaway stage at none. */
  domain: DomainSetting | undefined;
  /**
   * The API sends email from the stage's domain (SES identity, DKIM and MAIL
   * FROM records in the domain's hosted zone, which must be in the stage's
   * account). Off without a domain, and on a throwaway stage, which has none.
   */
  email: boolean;
  production: boolean;
  /** SST's `protect`: `sst remove` refuses the stage. */
  protect: boolean;
  /** SST's `removal`: what `sst remove` (or deleting a component) does to buckets and tables. */
  removal: "remove" | "retain";
  /** The table refuses deletion: stages that hold data someone cares about. */
  tableDeletionProtection: boolean;
}

const STAGE_NAME = /^[a-z][a-z0-9-]{0,30}$/;

function domainOf(stage: string, domain: string | null): DomainSetting | undefined {
  if (!domain) return undefined;
  if (stage === "production") return { name: domain, redirects: [`www.${domain}`] };
  if (stage === "dev") return { name: `dev.${domain}`, redirects: [] };
  return undefined;
}

export function stageSettings(
  stage: string,
  config: AccountsConfig = ACCOUNTS_FILE,
): StageSettings {
  if (!STAGE_NAME.test(stage)) {
    throw new Error(
      `Stage "${stage}" must be lowercase letters, digits and dashes, starting with a letter`,
    );
  }
  const production = stage === "production";
  // Stages that hold data someone cares about. SST empties a bucket before
  // deleting it, so dev is protected as well as production: `sst remove`
  // refuses both outright (infra/CLAUDE.md: never remove dev).
  const kept = production || stage === "dev";
  const domain = domainOf(stage, config.domain);
  return {
    basicAuth: !production,
    domain,
    email: domain !== undefined,
    production,
    protect: kept,
    // Also dev: a bucket or the table dropped from the config, or renamed,
    // stays in AWS with its data instead of being emptied and deleted.
    removal: kept ? "retain" : "remove",
    tableDeletionProtection: kept,
  };
}

/**
 * The AWS profile SST and the deploy-time AWS CLI use for a stage's account:
 * its own everywhere but GitHub Actions, where the deploy role's credentials
 * are in the environment and a runner has no profiles. `allowedAccountIds`
 * still refuses any other account.
 */
export function awsProfile(
  stage: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  if (env.GITHUB_ACTIONS === "true") return undefined;
  return accountStage(stage) === "production" ? "acme-prod" : "acme-dev";
}

/**
 * The permissions boundary every app role in the account carries: the most a
 * function may do, whatever its own policies say. Created once per account
 * by infra/aws/github-deploy.yaml (AppRoleBoundary), which also lets the
 * deploy role create or change a role only with it.
 */
export function appRoleBoundary(accountId: string): string {
  return `arn:aws:iam::${accountId}:policy/acme-app-role-boundary`;
}
