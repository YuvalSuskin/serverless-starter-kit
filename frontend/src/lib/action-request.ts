// A server action call Next would answer with a 500:
// Next refuses a foreign Origin (its CSRF check), a body over its limit and a
// body React cannot decode, and answers each as a server error
// (next/dist/server/app-render/action-handler.js: every error but redirect()
// and notFound() is a 500). Anyone could raise the site's 5xx count at will.
// The proxy refuses them first, as the 4xx they are; what passes is what Next
// itself would take.

/**
 * Next's serverActions.bodySizeLimit: its default, 1 MB (next.config.ts sets
 * none). The form's longest call is a few kilobytes.
 */
export const ACTION_BODY_LIMIT = 1024 * 1024;

/** A request Next treats as a server action call (its server-action-request-meta). */
function possibleAction(request: Request): boolean {
  if (request.method !== "POST") return false;
  const type = request.headers.get("content-type") ?? "";
  return (
    request.headers.has("next-action") ||
    type.startsWith("multipart/form-data") ||
    type.startsWith("application/x-www-form-urlencoded")
  );
}

/**
 * Next's CSRF check: an Origin, when sent, must be the host the request was
 * made to, x-forwarded-host's first value (the distribution's, set by the
 * edge), else Host. No Origin passes, as in Next.
 */
export function foreignOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (origin === null) return false;
  let originHost: string;
  try {
    originHost = origin === "null" ? "null" : new URL(origin).host;
  } catch {
    return true;
  }
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded === undefined || forwarded === "" ? headers.get("host") : forwarded;
  return !host || originHost !== host;
}

// A reply's references to another of its parts (React's reply protocol,
// parseModelString): a promise ($@), a server reference ($h), a Map ($Q), a
// Set ($W), an iterator ($i) or an outlined value ($<hex>), each naming the
// part by its hex id. A part that is not there fails the whole decode.
const REFERENCE = /^\$(?:[@hQWi]|(?=[\da-f]))([\da-f]+)/;

/** Whether every part the reply's root reaches is there and reads as JSON. */
function decodable(parts: FormData): boolean {
  const seen = new Set<string>();
  const pending = ["0"];
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    if (seen.has(id)) continue;
    seen.add(id);
    const part = parts.get(id);
    if (typeof part !== "string") return false;
    try {
      JSON.parse(part, (_key, value: unknown) => {
        const reference = typeof value === "string" ? REFERENCE.exec(value)?.[1] : undefined;
        if (reference !== undefined) pending.push(String(Number.parseInt(reference, 16)));
        return value;
      });
    } catch {
      return false;
    }
  }
  return true;
}

/** A fetch action's body as React reads it: the form, or a string standing as its root. */
async function replyOf(body: ArrayBuffer, type: string): Promise<FormData | undefined> {
  if (!type.startsWith("multipart/form-data")) {
    const form = new FormData();
    form.set("0", new TextDecoder().decode(body));
    return form;
  }
  try {
    return await new Response(body, { headers: { "content-type": type } }).formData();
  } catch {
    return undefined;
  }
}

/**
 * The status to refuse a server action call with, or undefined to let Next
 * answer it: 403 for a foreign Origin, 413 for a body over Next's limit, 400
 * for a fetch action's body React could not decode.
 */
export async function actionRefusal(request: Request): Promise<400 | 403 | 413 | undefined> {
  if (!possibleAction(request)) return undefined;
  if (foreignOrigin(request.headers)) return 403;
  if (Number(request.headers.get("content-length") ?? 0) > ACTION_BODY_LIMIT) return 413;
  // A form post before the page's script runs (no next-action) is Next's to
  // read: React decodes it another way.
  if (!request.headers.has("next-action")) return undefined;
  // A clone: the action reads the body again. The proxy is handed it whole
  // (OpenNext from the Lambda's event, `next start` up to 10 MB).
  const body = await request.clone().arrayBuffer();
  if (body.byteLength > ACTION_BODY_LIMIT) return 413;
  const reply = await replyOf(body, request.headers.get("content-type") ?? "");
  return reply && decodable(reply) ? undefined : 400;
}
