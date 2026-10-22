// Built with the Lambda bundles' own options by sdk-errors.test.ts: which
// AWS SDK error classes an error passes `instanceof` for, once bundled.
import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from "@aws-sdk/client-dynamodb";

const meta = { $metadata: {}, message: "probe" };

export function matches() {
  const throttled = new TransactionCanceledException(meta);
  return {
    conditionFailedIsCancelled:
      new ConditionalCheckFailedException(meta) instanceof TransactionCanceledException,
    conditionFailedIsConditionFailed:
      new ConditionalCheckFailedException(meta) instanceof ConditionalCheckFailedException,
    transactionIsConditionFailed: throttled instanceof ConditionalCheckFailedException,
    transactionIsTransaction: throttled instanceof TransactionCanceledException,
  };
}
