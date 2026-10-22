// Skeleton: a stage's email: the SES identity for its sending domain, the two
// configuration sets that decide what SES suppresses, the DNS records that
// verify the domain, what the API may send, and its environment. Built only
// for a stage that has a domain (`email` in src/stage.ts): the sending domain
// follows `domain` in deploy/accounts.json, and its hosted zone must be in the
// stage's account. Nothing here is billed while no email is sent.
import type { Permission } from "./permissions";
import type { StageSettings } from "./stage";

/** The two streams (backend `EmailStream`) and the reasons each suppresses. */
const STREAMS = {
  // A complaint about a mail the team sent stops further mail to that address.
  team: ["BOUNCE", "COMPLAINT"],
  // Notices still reach someone who complained about another kind of mail.
  notices: ["BOUNCE"],
} as const;

export interface EmailPlan {
  configurationSets: { notices: string; team: string };
  /** The sending domain: the host of the stage's public address. */
  domain: string;
  /** The sender's address. */
  from: string;
  /** The custom MAIL FROM domain, so SPF aligns under the domain's DMARC. */
  mailFrom: string;
  /** The region SES runs in: the project's. */
  region: string;
  /**
   * The stage's account is in SES's sandbox (every account but production's,
   * until AWS grants production access): SES then also checks the
   * recipient's verified identity.
   */
  sandbox: boolean;
}

/** The stage's email, or undefined when it sends none. */
export function emailPlan(
  stage: string,
  settings: StageSettings,
  region: string,
): EmailPlan | undefined {
  if (!settings.email || !settings.domain) return undefined;
  const { name: domain } = settings.domain;
  return {
    configurationSets: { notices: `acme-${stage}-notices`, team: `acme-${stage}-team` },
    domain,
    from: `no-reply@${domain}`,
    mailFrom: `mail.${domain}`,
    region,
    sandbox: !settings.production,
  };
}

/** One configuration set's arguments (aws.sesv2.ConfigurationSet). */
export function configurationSetArgs(plan: EmailPlan, stream: keyof typeof STREAMS) {
  return {
    configurationSetName: plan.configurationSets[stream],
    reputationOptions: { reputationMetricsEnabled: true },
    sendingOptions: { sendingEnabled: true },
    suppressionOptions: { suppressedReasons: [...STREAMS[stream]] },
    // No open pixel and no rewritten link, even if the account's
    // deliverability insights are turned on later.
    vdmOptions: { dashboardOptions: { engagementMetrics: "DISABLED" } },
  };
}

/** The domain identity (aws.sesv2.EmailIdentity), signed with Easy DKIM. */
export function emailIdentityArgs(plan: EmailPlan) {
  return {
    dkimSigningAttributes: { nextSigningKeyLength: "RSA_2048_BIT" },
    emailIdentity: plan.domain,
  };
}

/** The custom MAIL FROM (aws.sesv2.EmailIdentityMailFromAttributes). */
export function mailFromArgs(plan: EmailPlan) {
  return {
    behaviorOnMxFailure: "USE_DEFAULT_VALUE",
    emailIdentity: plan.domain,
    mailFromDomain: plan.mailFrom,
  };
}

/** How many records `dnsRecords` makes: Easy DKIM's three tokens, the MAIL FROM's MX and SPF. */
export const DNS_RECORD_COUNT = 5;

export interface DnsRecord {
  name: string;
  records: string[];
  type: "CNAME" | "MX" | "TXT";
}

/**
 * What verifies the domain, inside its own zone: three DKIM CNAMEs and the
 * MAIL FROM's MX and SPF. None at the domain's apex, so the domain's own
 * mail is untouched. The DKIM targets carry the region, as AWS issues them in
 * opt-in regions; for another region, compare with the identity's records in
 * the SES console after the first deploy.
 */
export function dnsRecords(plan: EmailPlan, dkimTokens: readonly string[]): DnsRecord[] {
  return [
    ...dkimTokens.map((token) => ({
      name: `${token}._domainkey.${plan.domain}`,
      records: [`${token}.dkim.${plan.region}.amazonses.com`],
      type: "CNAME" as const,
    })),
    {
      name: plan.mailFrom,
      records: [`10 feedback-smtp.${plan.region}.amazonses.com`],
      type: "MX" as const,
    },
    { name: plan.mailFrom, records: ["v=spf1 include:amazonses.com ~all"], type: "TXT" as const },
  ];
}

/**
 * What the API may do in SES: send, as the stage's identity, through its two
 * sets. In the sandbox SES also checks the recipient's verified identity, so a
 * sandbox stage may name any identity in its own account and region;
 * production names its identity only.
 */
export function emailPermissions(plan: EmailPlan, accountId: string): Permission[] {
  const arn = (resource: string) => `arn:aws:ses:${plan.region}:${accountId}:${resource}`;
  return [
    {
      actions: ["ses:SendEmail"],
      resources: [
        plan.sandbox ? arn("identity/*") : arn(`identity/${plan.domain}`),
        arn(`configuration-set/${plan.configurationSets.team}`),
        arn(`configuration-set/${plan.configurationSets.notices}`),
      ],
    },
  ];
}

/** The API's email settings (backend config's EMAIL_*). */
export function emailEnvironment(plan: EmailPlan, siteUrl: string): Record<string, string> {
  return {
    EMAIL: "on",
    EMAIL_FROM: plan.from,
    EMAIL_NOTICES_CONFIGURATION_SET: plan.configurationSets.notices,
    EMAIL_SITE_URL: new URL(siteUrl).origin,
    EMAIL_TEAM_ADDRESS: `hello@${plan.domain}`,
    EMAIL_TEAM_CONFIGURATION_SET: plan.configurationSets.team,
  };
}
