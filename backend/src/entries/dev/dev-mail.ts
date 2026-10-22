import type { FakeMailer } from "../../fakes/mailer";

import { escapeHtml } from "../../domain/lib/escape-html";

// `pnpm dev`, previews and the e2e only: what
// the fake mailer accepted, served beside the app, not inside it. The page
// lists the last emails, newest first, each as its recipient would see it in
// a sandboxed frame, and as text; `/api/dev-mail/sent.json` gives the same to
// a test. Text a visitor typed is in every email, so the page runs nothing:
// the answer's CSP sandboxes it and each frame is `sandbox` with no allowance.

/** The path the dev mailbox answers on. */
const DEV_MAIL_BASE = "/api/dev-mail";

const PAGE_POLICY = "sandbox; default-src 'none'; style-src 'unsafe-inline'";

export function devMail(mailer: Pick<FakeMailer, "sent">, request: Request): Response | undefined {
  const { pathname } = new URL(request.url);
  if (pathname !== DEV_MAIL_BASE && !pathname.startsWith(`${DEV_MAIL_BASE}/`)) return undefined;
  if (request.method !== "GET") return new Response(null, { status: 405 });
  const newest = [...mailer.sent].reverse();
  if (pathname === `${DEV_MAIL_BASE}/sent.json`) {
    return Response.json(newest, { headers: { "cache-control": "no-store" } });
  }
  if (pathname !== DEV_MAIL_BASE) return new Response(null, { status: 404 });
  const items = newest
    .map(
      (email) => `<article>
<h2>${escapeHtml(email.subject)}</h2>
<p class="meta"><span dir="ltr">${escapeHtml(email.to)}</span> · ${escapeHtml(email.kind)} · ${escapeHtml(email.at)} · reply to <span dir="ltr">${escapeHtml(email.replyTo)}</span></p>
<iframe sandbox title="${escapeHtml(email.subject)}" srcdoc="${escapeHtml(email.html)}"></iframe>
<details><summary>text</summary><pre>${escapeHtml(email.text)}</pre></details>
</article>`,
    )
    .join("\n");
  const page = `<!doctype html>
<html lang="en" dir="ltr"><head><meta charset="utf-8"><title>Dev mailbox</title>
<style>body{font-family:system-ui,sans-serif;margin:24px;background:#f4f4f4}article{background:#fff;padding:16px;margin:0 0 24px;border-radius:12px}iframe{width:100%;height:640px;border:1px solid #ddd;border-radius:8px}.meta{color:#666;font-size:13px}pre{white-space:pre-wrap}</style>
</head><body><h1>Dev mailbox</h1>
${items === "" ? "<p>No email sent since the dev server started.</p>" : items}
</body></html>`;
  return new Response(page, {
    headers: {
      "cache-control": "no-store",
      "content-security-policy": PAGE_POLICY,
      "content-type": "text/html; charset=utf-8",
    },
  });
}
