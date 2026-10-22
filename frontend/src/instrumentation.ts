import { startApiWarmUp } from "@/lib/data/api-warm-up";

// Runs once as the server starts (Next's instrumentation hook), inside the
// site Lambda's cold start: the API's cold start begins now, beside the
// site's, not after it.
export function register(): void {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  startApiWarmUp(process.env.API_ORIGIN, process.env.ORIGIN_SECRET);
}
