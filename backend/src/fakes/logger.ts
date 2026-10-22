import type { Logger } from "../platform/logger";

import { type LogLevel, type LogLine, toLogLine } from "../platform/log-line";

export interface RecordingLogger extends Logger {
  readonly lines: LogLine[];
}

// Keeps every line for tests to inspect. With `print` it writes readable
// lines to stdout instead, for the local dev server, and keeps
// none: the dev server runs for hours.
export function recordingLogger({ print = false } = {}): RecordingLogger {
  const lines: LogLine[] = [];
  const write =
    (level: LogLevel) =>
    (message: string, fields?: Record<string, unknown>): void => {
      const line = toLogLine(level, message, fields);
      if (print)
        process.stdout.write(`${level.toUpperCase()} ${message} ${JSON.stringify(line.fields)}\n`);
      else lines.push(line);
    };
  return {
    debug: write("debug"),
    error: write("error"),
    info: write("info"),
    lines,
    warn: write("warn"),
  };
}
