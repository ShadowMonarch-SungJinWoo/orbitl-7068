/**
 * Plain-text mirror for note bodies.
 *
 * Notes are authored as HTML (tables, headings, KaTeX formulas), but AI prompts
 * and the search index must never see markup: tags waste tokens, and a note full
 * of `<td>` would have the model summarising the table structure instead of the
 * chemistry. The mirror is computed server-side on every write so it can never
 * drift out of sync with the content the client sent.
 */

const BLOCK_TAGS = /<\/(p|div|h[1-6]|li|tr|blockquote|pre|figure|table|thead|tbody)>/gi;

export function htmlToText(html: string): string {
  return (
    html
      // Formulas already carry their LaTeX as text content, so nothing to do there.
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(BLOCK_TAGS, "\n")
      // Cell boundaries become tabs so a table still reads as a table in the prompt.
      .replace(/<\/(td|th)>/gi, "\t")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** Strips the syntax from legacy markdown notes without pulling in a parser. */
export function markdownToText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ""))
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function plainText(content: string, format: string): string {
  if (!content) return "";
  return format === "html" ? htmlToText(content) : markdownToText(content);
}
