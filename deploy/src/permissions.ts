// Skeleton: least privilege for the API. Item actions on its table only:
// SST's `link` would grant dynamodb:*, so a compromised API could switch off
// the table's deletion protection. What else the API may do (send email) is
// src/email.ts's; a function that gains a resource gains its actions here,
// each with a test.

export interface Permission {
  actions: string[];
  resources: string[];
}

// Every call the DynamoDB adapters make (backend/src/adapters/dynamodb/):
// TransactWrite needs the per-item actions plus ConditionCheckItem.
const TABLE_ACTIONS = [
  "dynamodb:BatchGetItem",
  "dynamodb:BatchWriteItem",
  "dynamodb:ConditionCheckItem",
  "dynamodb:DeleteItem",
  "dynamodb:GetItem",
  "dynamodb:PutItem",
  "dynamodb:Query",
  "dynamodb:UpdateItem",
];

export function apiPermissions(tableArn: string): Permission[] {
  return [{ actions: TABLE_ACTIONS, resources: [tableArn, `${tableArn}/index/*`] }];
}

/**
 * A bucket CloudFront serves (the site's files): this stage's distribution
 * may read it, and no other. SST's `access: "cloudfront"` would let any
 * distribution, in any account, read it through its own origin access
 * control.
 */
export function cloudfrontReadPolicy(distributionArn: string) {
  return {
    actions: ["s3:GetObject"],
    conditions: [{ test: "StringEquals", values: [distributionArn], variable: "AWS:SourceArn" }],
    paths: ["*"],
    principals: [{ identifiers: ["cloudfront.amazonaws.com"], type: "service" as const }],
  };
}
