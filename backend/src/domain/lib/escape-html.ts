// Skeleton: a small pure helper, the example of what goes in src/domain/lib/.

/** Text made safe to put in HTML, in an element or in a quoted attribute. */
export const escapeHtml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
