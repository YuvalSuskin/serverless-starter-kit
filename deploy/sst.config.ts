/// <reference path="./.sst/platform/config.d.ts" />

// Skeleton: acme on AWS: one SST app, one CloudFront distribution per stage.
// Read deploy/CLAUDE.md and docs/runbooks/deployment.md before changing it,
// and read `sst diff` before every deploy. Renaming a component replaces it:
// data in a renamed table is lost.
//
// What it deploys: the API Lambda behind an API Gateway HTTP API, the table
// the API's messages live in, the Next.js site (OpenNext's build, wired by
// hand), and the router that fronts both. The accounts, the region and the
// domain come from deploy/accounts.json (`/bootstrap accounts` fills it);
// while it is empty the app refuses to load.
//
// The building blocks are in src/, unit-tested; this file only wires them.
// SST loads it with its own esbuild, so imports are dynamic.

export default $config({
  async app(input) {
    const { awsProfile, awsTarget, stageSettings } = await import("./src/stage");
    const settings = stageSettings(input.stage);
    // Stops here, naming /bootstrap accounts, while accounts.json is empty
    // (SST shows only "Unexpected error"; `--print-logs` and `pnpm sst:diff`,
    // which checks first, show the message).
    const { account, region } = awsTarget(input.stage);
    return {
      name: "acme",
      home: "aws",
      protect: settings.protect,
      removal: settings.removal,
      providers: {
        aws: {
          region: region as aws.Region,
          // None in GitHub Actions: the deploy role's credentials are in the environment.
          profile: awsProfile(input.stage),
          // Refuses to run against the wrong account: production only ever in
          // its own account, everything else only in dev's.
          allowedAccountIds: account ? [account] : undefined,
          defaultTags: { tags: { "acme:app": "acme", "acme:stage": input.stage } },
        },
        command: "1.0.1",
      },
    };
  },
  async run() {
    const path = await import("node:path");
    const { accountStage, appRoleBoundary, awsProfile, requireAccount, stageSettings } =
      await import("./src/stage");
    const { compactFunctionCode, viewerRequestInjection } = await import("./src/edge");
    // CloudFront function code carries the origin secret and the basic auth
    // credential: keep it encrypted in SST's state. Compacted, so SST's router
    // and our rules fit CloudFront's 10,240 bytes (decision S20).
    $transform(aws.cloudfront.Function, (args) => {
      args.code = $util.secret($util.output(args.code).apply(compactFunctionCode));
    });
    const { apiEnvironment, originOf } = await import("./src/environment");
    const { apiPermissions, cloudfrontReadPolicy } = await import("./src/permissions");
    const { BUNDLES, bundleDir } = await import("./src/bundles");
    const email = await import("./src/email");
    const { noErrorCaching, securityHeaders } = await import("./src/cdn");
    const { dynamoKeys } = await import("./src/table");
    const web = await import("./src/web");
    const settings = stageSettings($app.stage);
    const { account, region } = requireAccount(accountStage($app.stage));
    // Every role (the functions' own, inside SST's components) carries the
    // account's permissions boundary: the most a function may do, and the
    // only way the GitHub deploy role may create or change a role
    // (infra/aws/github-deploy.yaml).
    $transform(aws.iam.Role, (args) => {
      args.permissionsBoundary = appRoleBoundary(account);
    });
    // The deploy-time shell commands (upload, invalidation) act as the stage's account.
    const profile = awsProfile($app.stage);
    const awsCli = { ...(profile ? { AWS_PROFILE: profile } : {}), AWS_REGION: region };

    // Secrets. Set once per stage, never printed: docs/runbooks/deployment.md
    // says how.
    const originSecret = new sst.Secret("OriginSecret");
    const basicAuthPassword = settings.basicAuth ? new sst.Secret("BasicAuthPassword") : undefined;
    // Where the demo's contact messages are mailed (bootstrap step 6 replaces
    // the demo). Not a secret, but per stage and kept out of the repo. Empty
    // by default: messages are then stored and no mail is sent.
    const ownerEmail = new sst.Secret("OwnerEmail", "");

    // The security headers on every answer (src/cdn.ts). A policy is free.
    const securityHeadersPolicy = new aws.cloudfront.ResponseHeadersPolicy("SecurityHeaders", {
      name: `acme-${$app.stage}-security`,
      securityHeadersConfig: securityHeaders(),
    });

    // The distribution. Its viewer-request function starts with basic auth
    // (every stage but production), then sets the origin secret, the visitor's
    // address and OpenNext's cache key, then routes (SST's code).
    const router = new sst.aws.Router("Cdn", {
      domain: settings.domain && {
        name: settings.domain.name,
        redirects: settings.domain.redirects,
        dns: sst.aws.dns(),
      },
      edge: {
        viewerRequest: {
          injection: $resolve([originSecret.value, basicAuthPassword?.value ?? ""]).apply(
            ([origin, password]) =>
              viewerRequestInjection({
                basicAuthPassword: basicAuthPassword ? password : undefined,
                originSecret: origin,
              }),
          ),
        },
      },
      transform: {
        cdn: (args) => {
          // No error answer outlives what its origin allows.
          args.customErrorResponses = noErrorCaching();
          const routed = args.defaultCacheBehavior;
          // The security headers on everything the router serves.
          args.defaultCacheBehavior = $util
            .output({ behaviour: routed, policy: securityHeadersPolicy.id })
            .apply(({ behaviour, policy }) => ({ ...behaviour, responseHeadersPolicyId: policy }));
        },
      },
    });
    const distribution = router.nodes.cdn.apply((cdn) => cdn.nodes.distribution);
    const distributionArn = distribution.arn;
    const siteUrl = settings.domain ? `https://${settings.domain.name}` : router.url;

    // The table: keys from the backend's own definition, 30 days of
    // point-in-time recovery. What holds data refuses a delete or replace in
    // Pulumi itself on dev and production: the diff guard reads the plan,
    // this stops the deploy. A deliberate replace starts with a PR removing it.
    const keepData = (_args: unknown, opts: $util.CustomResourceOptions): undefined => {
      opts.protect = settings.protect;
      return undefined;
    };
    const table = new sst.aws.Dynamo("Data", {
      // Keys and the TTL attribute (expired items are deleted by DynamoDB),
      // from the backend's table.
      ...dynamoKeys(),
      deletionProtection: settings.tableDeletionProtection,
      transform: {
        table: (args, opts) => {
          args.pointInTimeRecovery = { enabled: true, recoveryPeriodInDays: 30 };
          keepData(args, opts);
        },
      },
    });

    // The stage's email: nothing unless it has a domain (`email` in
    // src/stage.ts). The sending identity follows the domain.
    const sending = email.emailPlan($app.stage, settings, region);
    if (sending) emailResources(email, sending);

    // The API: the bundle `pnpm build` makes and the bundle tests check, in
    // its own folder (scripts/package.ts), behind an API Gateway HTTP API
    // (some regions have no Lambda function URLs).
    const api = new sst.aws.Function("Api", {
      bundle: bundleDir(BUNDLES.api),
      handler: "api.handler",
      runtime: "nodejs24.x",
      architecture: "arm64",
      memory: "1024 MB",
      // Under CloudFront's 20-second origin read timeout, so a slow call ends
      // in the Lambda, not as a 504 while it keeps running.
      timeout: "19 seconds",
      permissions: table.arn.apply((tableArn) => [
        ...apiPermissions(tableArn),
        // The contact message's mail to the owner, through SES.
        ...(sending ? email.emailPermissions(sending, account) : []),
      ]),
      environment: $resolve([
        table.name,
        originSecret.value,
        ownerEmail.value,
        $output(siteUrl),
      ]).apply(([tableName, origin, owner, site]) =>
        apiEnvironment({
          ...(sending ? { email: email.emailEnvironment(sending, site) } : {}),
          originSecret: origin,
          ownerEmail: owner,
          stage: $app.stage,
          table: tableName,
        }),
      ),
    });
    const apiGateway = new sst.aws.ApiGatewayV2("ApiGateway", { cors: false });
    apiGateway.route("$default", api.arn);
    router.route("/api", apiGateway.url);

    // The site: OpenNext's build, wired by hand because SST's Nextjs
    // component needs Lambda function URLs, which not every region has.
    //
    // 1. Build. Read at build time: SITE_URL (web.webBuildEnvironment). `sst
    //    diff` builds too, as SST's own sites do.
    const buildEnvironment = $output(siteUrl).apply(web.webBuildEnvironment);
    const frontendDir = path.join($cli.paths.root, "../frontend");
    const build = buildEnvironment.apply((environment) => {
      const args = {
        create: "pnpm run build:opennext",
        update: "pnpm run build:opennext",
        dir: frontendDir,
        environment,
        triggers: [Date.now().toString()],
      };
      const step = new command.local.Command("WebBuild", args);
      const done =
        $cli.command === "diff" || $cli.command === "refresh"
          ? command.local.runOutput({ command: args.create, dir: frontendDir, environment }).stdout
          : step.stdout;
      return done.apply(() => {
        web.installServerStart(web.SERVER_BUNDLE);
        return { step, buildId: web.buildId(web.OPEN_NEXT_DIR) };
      });
    });
    const buildId = build.apply((b) => b.buildId);

    // 2. Static files and prerendered pages, in one bucket only this
    //    distribution can read.
    const webAssets = new sst.aws.Bucket("WebAssets", {
      cors: false,
      policy: [distributionArn.apply(cloudfrontReadPolicy)],
    });
    const upload = build.apply((built) =>
      webAssets.name.apply(
        (bucket) =>
          new command.local.Command(
            "WebUpload",
            {
              create: web.uploadCommand(web.OPEN_NEXT_DIR, bucket),
              update: web.uploadCommand(web.OPEN_NEXT_DIR, bucket),
              dir: $cli.paths.root,
              environment: awsCli,
              triggers: [built.buildId],
            },
            { dependsOn: [built.step] },
          ),
      ),
    );
    build.apply(() => {
      for (const route of web.assetRoutes(web.OPEN_NEXT_DIR)) router.routeBucket(route, webAssets);
    });

    // 3. The server: arm64, about 1.5 GB, behind its own HTTP API.
    const server = new sst.aws.Function("WebServer", {
      // Only once the build's files are uploaded: the new server's pages
      // point at them.
      bundle: upload.apply((uploaded) => uploaded.stdout).apply(() => web.SERVER_BUNDLE),
      // Wakes the API, then OpenNext's index.handler.
      handler: web.SERVER_HANDLER,
      runtime: "nodejs24.x",
      architecture: "arm64",
      memory: "1536 MB",
      timeout: "20 seconds",
      permissions: webAssets.arn.apply((arn) => [
        {
          actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
          resources: [`${arn}/${web.CACHE_PREFIX}/*`],
        },
        { actions: ["s3:ListBucket"], resources: [arn] },
      ]),
      environment: $resolve([
        webAssets.name,
        apiGateway.url,
        originSecret.value,
        $output(siteUrl),
      ]).apply(([bucket, apiOrigin, origin, site]) =>
        web.webServerEnvironment({
          apiOrigin: originOf(apiOrigin),
          bucket,
          originSecret: origin,
          region,
          siteUrl: site,
        }),
      ),
    });
    const webGateway = new sst.aws.ApiGatewayV2("WebGateway", { cors: false });
    webGateway.route("$default", server.arn);
    router.route("/", webGateway.url);

    // 4. After each deploy, CloudFront forgets cached pages and public files
    //    (hashed files never change).
    upload.apply((uploaded) =>
      $resolve([distribution.id, buildId]).apply(([id, built]) => {
        const invalidate = `aws cloudfront create-invalidation --distribution-id ${id} --paths "/*" --output text --query Invalidation.Id`;
        return new command.local.Command(
          "WebInvalidation",
          { create: invalidate, update: invalidate, environment: awsCli, triggers: [built] },
          // After the new files and the new server code are both live.
          { dependsOn: [uploaded, server.nodes.function] },
        );
      }),
    );

    return { url: siteUrl };
  },
});

type EmailModule = typeof import("./src/email");

/**
 * The stage's SES identity, its MAIL FROM, its two configuration sets and the
 * records that verify it, in the domain's own zone, which must be in this
 * account; none at its apex.
 */
function emailResources(
  email: EmailModule,
  sending: NonNullable<ReturnType<EmailModule["emailPlan"]>>,
) {
  const identity = new aws.sesv2.EmailIdentity("EmailIdentity", email.emailIdentityArgs(sending));
  // eslint-disable-next-line sonarjs/constructor-for-side-effects -- Pulumi resources register themselves
  new aws.sesv2.EmailIdentityMailFromAttributes("EmailMailFrom", email.mailFromArgs(sending), {
    dependsOn: [identity],
  });
  // eslint-disable-next-line sonarjs/constructor-for-side-effects -- Pulumi resources register themselves
  new aws.sesv2.ConfigurationSet("EmailTeamSet", email.configurationSetArgs(sending, "team"));
  // eslint-disable-next-line sonarjs/constructor-for-side-effects -- Pulumi resources register themselves
  new aws.sesv2.ConfigurationSet("EmailNoticesSet", email.configurationSetArgs(sending, "notices"));
  const zone = aws.route53.getZoneOutput({ name: sending.domain, privateZone: false });
  // Easy DKIM issues three tokens; the MAIL FROM adds its MX and SPF.
  const records = identity.dkimSigningAttributes.apply((attributes) =>
    email.dnsRecords(sending, attributes.tokens),
  );
  for (let index = 0; index < email.DNS_RECORD_COUNT; index++) {
    const record = records.apply((list) => list.at(index));
    // eslint-disable-next-line sonarjs/constructor-for-side-effects -- Pulumi resources register themselves
    new aws.route53.Record(`EmailDns${String(index)}`, {
      name: record.apply((r) => r?.name ?? ""),
      records: record.apply((r) => r?.records ?? []),
      ttl: 1800,
      type: record.apply((r) => r?.type ?? "TXT"),
      zoneId: zone.zoneId,
    });
  }
}
