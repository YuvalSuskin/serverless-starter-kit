// Something loaded on first use, then kept: the API's rarely used
// AWS SDK clients (CloudFront, SES, SQS) are imported when a route first
// needs them, not at every cold start. Bundled into the one file (esbuild
// without code splitting), such an import is a module evaluated lazily, so
// a cold start no longer runs its code.

/** Runs `load` on the first call and keeps its promise; a failed load is tried again on the next. */
export function once<T>(load: () => Promise<T>): () => Promise<T> {
  let loading: Promise<T> | undefined;
  return () =>
    (loading ??= load().catch((error: unknown) => {
      loading = undefined;
      throw error;
    }));
}
