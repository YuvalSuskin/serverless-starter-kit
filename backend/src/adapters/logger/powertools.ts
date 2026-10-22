import { Logger as PowertoolsLogger } from "@aws-lambda-powertools/logger";

import type { Config } from "../../platform/config";
import type { Logger } from "../../platform/logger";

import { type LogLevel, toLogLine } from "../../platform/log-line";

// JSON lines to CloudWatch through Powertools.
export function powertoolsLogger(level: Config["logLevel"], serviceName = "acme-api"): Logger {
  const logger = new PowertoolsLogger({ logLevel: level, serviceName });
  const write =
    (logLevel: LogLevel) =>
    (message: string, fields?: Record<string, unknown>): void => {
      const line = toLogLine(logLevel, message, fields);
      logger[logLevel](line.message, line.fields);
    };
  return { debug: write("debug"), error: write("error"), info: write("info"), warn: write("warn") };
}
