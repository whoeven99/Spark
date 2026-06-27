/** Shared HTML detection — content-based, not field-name-based. */

const HTML_TAG_RE = /<\/?[a-z][^>]*>/i;

/** True when the string contains HTML markup (e.g. `<p>`, `<table>`, `<td style=...>`). */
export function isHtmlContent(value: string): boolean {
  return HTML_TAG_RE.test(value);
}
