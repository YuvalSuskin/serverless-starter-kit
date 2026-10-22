import type { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";

// OpenNext's settings for `pnpm build:opennext` (D4, provisional).
//
// - wrapper and converter: the server runs behind an API Gateway HTTP API,
//   because Lambda function URLs do not exist in every region. HTTP APIs do
//   not stream, so responses are buffered.
// - incrementalCache: prerendered pages are read from S3 (deploy/ uploads
//   them under _cache).
// - tagCache and queue: off. Nothing uses ISR or revalidateTag (app pages
//   render per request; marketing is static), and the SQS queue they
//   need is polled, so billed, while idle.
// - One server function. Splitting routes into several is a `functions`
//   entry here plus a gateway and a route each in deploy/.
const config = {
  default: {
    override: {
      converter: "aws-apigw-v2",
      incrementalCache: "s3",
      queue: "dummy",
      tagCache: "dummy",
      wrapper: "aws-lambda",
    },
  },
} satisfies OpenNextConfig;

export default config;
