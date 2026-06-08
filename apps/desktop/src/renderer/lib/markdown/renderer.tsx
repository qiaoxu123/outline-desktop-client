import { useMemo } from "react";
import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";
import katexPlugin from "@vscode/markdown-it-katex";
import hljs from "highlight.js";
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
// LaTeX math: $inline$ and $$block$$ rendered with KaTeX (matches Outline web)
type MdPlugin = (md: MarkdownIt, ...args: unknown[]) => void;
md.use(
  (katexPlugin as unknown as { default?: MdPlugin }).default ??
    (katexPlugin as unknown as MdPlugin),
);

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
