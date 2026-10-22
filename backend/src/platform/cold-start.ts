// What a Lambda does once while it starts, so its first request does not
// wait on it. Only on
// Lambda (`primeColdStart` in platform/config.ts): tests and `pnpm dev` load
// the same entries and prime nothing.

/** The longest a cold start waits for its priming, whatever the network does. */
const PRIME_LIMIT_MS = 1000;

/**
 * Runs each step together, giving each the same abort signal, and resolves
 * when all have finished or the limit has passed. Never rejects: a step that
 * fails or hangs only leaves its work to the first request.
 */
export async function prime(
  steps: readonly ((signal: AbortSignal) => Promise<unknown>)[],
  limitMs = PRIME_LIMIT_MS,
): Promise<void> {
  const signal = AbortSignal.timeout(limitMs);
  const limit = new Promise<void>((resolve) => {
    signal.addEventListener("abort", () => {
      resolve();
    });
  });
  const all = Promise.allSettled(
    steps.map(async (step) => {
      await step(signal);
    }),
  );
  await Promise.race([all, limit]);
}
