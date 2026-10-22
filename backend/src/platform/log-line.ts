import type { LogFields } from "./logger";

import { currentLogContext } from "./log-context";
import { redact } from "./redact";

export type LogLevel = "debug" | "error" | "info" | "warn";

export interface LogLine {
  fields: LogFields;
  level: LogLevel;
  message: string;
}

// What every logger implementation writes: the current log context merged
// with the caller's fields, then redacted. The Powertools logger
// and the test recorder both build lines here, so they cannot drift apart.
export function toLogLine(level: LogLevel, message: string, fields: LogFields = {}): LogLine {
  return {
    fields: redact({ ...currentLogContext(), ...fields }) as LogFields,
    level,
    message,
  };
}
