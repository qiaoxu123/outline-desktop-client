/**
 * Normalize quirks in Outline's exported markdown before it is parsed for
 * display or loaded into the editor.
 *
 * Outline stores documents as a ProseMirror doc (rendered correctly on web)
 * and only produces markdown on export. That export glues an image to a
 * following blockquote on the SAME line:
 *
 *   ![alt](url)> **Fig. X** caption…
 *
 * In CommonMark a `>` only starts a blockquote at the start of a line, so here
 * it is treated as literal text — the figure caption renders as a stray
 * "> …" paragraph instead of a blockquote, and the visual split from the image
 * is lost. Every figure in our paper interpretations uses this pattern, so the
 * fix belongs in the client renderer (one fix heals every document) rather than
 * in hundreds of stored documents. Split the image onto its own line with a
 * blank line before the blockquote.
 *
 * Only the image→blockquote glue (`)>` right after an image link) is touched;
 * correctly-separated content (a newline already between `)` and `>`) never
 * matches, and plain links `[t](u)>` are left alone (the leading `!` is
 * required).
 */
export function normalizeOutlineMarkdown(src: string): string {
  if (!src) return src;
  return src.replace(/(!\[[^\]]*\]\([^\n)]*\))>/g, "$1\n\n>");
}
