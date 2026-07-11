import { useMemo } from "react";
import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";
import katexPlugin from "@vscode/markdown-it-katex";
import markPlugin from "markdown-it-mark";
import hljs from "highlight.js";
import { absoluteAttachmentUrl } from "../server";
import { parseImageTitle } from "./imageTitle";
import "katex/dist/katex.min.css";
import "./highlight-theme.css";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false,
  highlight(str: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return (
          '<pre class="hljs"><code>' +
          hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
          "</code></pre>"
        );
      } catch {
        // fall through
      }
    }
    return (
      '<pre class="hljs"><code>' +
      md.utils.escapeHtml(str) +
      "</code></pre>"
    );
  },
});

md.use(taskLists, { enabled: true, label: true, labelAfter: true });
// LaTeX math: $inline$ and $$block$$ rendered with KaTeX (matches Outline web).
// strict:false silences the CJK-punctuation-in-math warning; throwOnError
// keeps a bad formula from blanking the whole document.
type MdPlugin = (md: MarkdownIt, opts?: unknown) => void;
md.use(
  (katexPlugin as unknown as { default?: MdPlugin }).default ??
    (katexPlugin as unknown as MdPlugin),
  { throwOnError: false, strict: false },
);
// ==highlight== → <mark> (pairs with the editor's highlight button)
md.use(
  (markPlugin as unknown as { default?: MdPlugin }).default ??
    (markPlugin as unknown as MdPlugin),
);

// Wide tables scroll inside their own container instead of overflowing the
// reading column (same .tableWrapper the editor emits).
md.renderer.rules.table_open = () => '<div class="tableWrapper"><table>';
md.renderer.rules.table_close = () => "</table></div>";

// Attachment images: absolutize the relative /api/… src for display, and
// decode Outline web's title conventions ("layoutClass =WxH") into width +
// layout class so resized/aligned images render like web.
const defaultImageRender =
  md.renderer.rules.image ??
  ((tokens, idx, options, _env, self) =>
    self.renderToken(tokens, idx, options));
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if (token) {
    const src = token.attrGet("src");
    if (src) token.attrSet("src", absoluteAttachmentUrl(src));
    const parsed = parseImageTitle(token.attrGet("title"));
    if (parsed.width) token.attrSet("width", String(parsed.width));
    if (parsed.layoutClass)
      token.attrJoin("class", `image-${parsed.layoutClass}`);
    if (parsed.title) token.attrSet("title", parsed.title);
    else if (token.attrGet("title") !== null) token.attrSet("title", "");
  }
  return defaultImageRender(tokens, idx, options, env, self);
};

const defaultRender =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) =>
    self.renderToken(tokens, idx, options));

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if (token) {
    const href = token.attrGet("href");
    if (href && !href.startsWith("#") && !href.startsWith("/")) {
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noopener noreferrer");
    }
  }
  return defaultRender(tokens, idx, options, env, self);
};

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps): React.ReactElement {
  const html = useMemo(() => md.render(content), [content]);

  return (
    <div
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default MarkdownRenderer;
