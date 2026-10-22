// The shapes every domain hook in src/lib/data/ returns (decision D1). Hooks
// such as useEventPhotos or useExcludePhoto wrap SWR internally but never
// return SWR's objects, so nothing outside this folder depends on SWR.

/** What a reading hook returns. */
export interface QueryResult<T> {
  data: T | undefined;
  error: Error | undefined;
  isLoading: boolean;
}

/** What a writing hook returns. */
export interface MutationResult<Args, Result> {
  trigger: (args: Args) => Promise<Result>;
  isPending: boolean;
}
