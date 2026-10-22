import { AsyncLocalStorage } from "node:async_hooks";

// Who is acting, on which unit, on which route. definePublicRoute
// sets it once per request; every log line and usage record reads it, so no
// handler ever passes it by hand.
export interface LogContext {
  correlationId: string;
  principal: "anonymous" | "system";
  route?: string;
  /** The deployment (dev, staging, prod), so their lines can be told apart. */
  stage?: string;
  /**
   * The billing unit the work is for (`demo` in the skeleton; bootstrap step 2
   * names the real one). Usage is attributed to it, and only to it.
   */
  unitId?: string;
}

const storage = new AsyncLocalStorage<LogContext>();

export function withLogContext<T>(context: LogContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** Adds fields (such as unitId, once known) to the current context. */
export function extendLogContext(fields: Partial<LogContext>): void {
  const current = storage.getStore();
  if (current) Object.assign(current, fields);
}

export function currentLogContext(): LogContext | undefined {
  return storage.getStore();
}
