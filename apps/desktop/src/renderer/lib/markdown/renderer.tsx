import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";
import katexPlugin from "@vscode/markdown-it-katex";
import markPlugin from "markdown-it-mark";
import hljs from "highlight.js";
import { absoluteAttachmentUrl } from "../server";
import { parseImageTitle } from "./imageTitle";
import { openOutlineLink } from "../outlineLinks";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { useUIStore } from "../../state/uiStore";
import "katex/dist/katex.min.css";
import "./highlight-theme.css";

type MdPlugin = (md: MarkdownIt, opts?: unknown) => void;

/**
 * Build a configured markdown-it instance. `breaks` controls whether a single
 * newline renders as <br> — off for documents (match Outline web), on for
 * authored content like quiz cards where line breaks are intentional.
 */
function createMd(breaks: boolean): MarkdownIt {
  const inst = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    breaks,
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
        '<pre class="hljs"><code>' + inst.utils.escapeHtml(str) + "</code></pre>"
      );
    },
  });

  inst.use(taskLists, { enabled: true, label: true, labelAfter: true });
  // LaTeX math: $inline$ and $$block$$ rendered with KaTeX (matches Outline web).
  // strict:false silences the CJK-punctuation-in-math warning; throwOnError
  // keeps a bad formula from blanking the whole document.
  inst.use(
    (katexPlugin as unknown as { default?: MdPlugin }).default ??
      (katexPlugin as unknown as MdPlugin),
    { throwOnError: false, strict: false },
  );
  // ==highlight== → <mark> (pairs with the editor's highlight button)
  inst.use(
    (markPlugin as unknown as { default?: MdPlugin }).default ??
      (markPlugin as unknown as MdPlugin),
  );

  // Render bare <br> tags as real line breaks even though html:false. Outline
  // serialises in-cell line breaks (and some hard breaks) as literal <br>, so
  // without this every multi-line table cell shows literal "<br>" text. Only
  // the exact <br>/<br/>/<br /> token is matched — no attributes, so it carries
  // no HTML-injection surface (unlike enabling html:true wholesale).
  inst.inline.ruler.before("text", "html_br", (state, silent): boolean => {
    if (state.src.charCodeAt(state.pos) !== 0x3c /* < */) return false;
    const rest = state.src.slice(state.pos);
    const br = /^<br\s*\/?>/i.exec(rest);
    if (br) {
      if (!silent) state.push("hardbreak", "br", 0);
      state.pos += br[0].length;
      return true;
    }
    // Underline: Outline stores it as <u>…</u> (no markdown syntax). Emit the
    // exact tag (no attributes → no injection surface) so it renders underlined.
    const u = /^<\/?u>/i.exec(rest);
    if (u) {
      if (!silent) {
        const t = state.push("html_inline", "", 0);
        t.content = u[0].toLowerCase();
      }
      state.pos += u[0].length;
      return true;
    }
    return false;
  });

  // Wide tables scroll inside their own container instead of overflowing the
  // reading column (same .tableWrapper the editor emits).
  inst.renderer.rules.table_open = () => '<div class="tableWrapper"><table>';
  inst.renderer.rules.table_close = () => "</table></div>";

  // Attachment images: absolutize the relative /api/… src for display, and
  // decode Outline web's title conventions ("layoutClass =WxH") into width +
  // layout class so resized/aligned images render like web.
  const defaultImageRender =
    inst.renderer.rules.image ??
    ((tokens, idx, options, _env, self) =>
      self.renderToken(tokens, idx, options));
  inst.renderer.rules.image = (tokens, idx, options, env, self) => {
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
    inst.renderer.rules.link_open ??
    ((tokens, idx, options, _env, self) =>
      self.renderToken(tokens, idx, options));
  inst.renderer.rules.link_open = (tokens, idx, options, env, self) => {
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

  return inst;
}

const md = createMd(false);
const mdBreaks = createMd(true);

interface MarkdownRendererProps {
  content: string;
  /** Render single newlines as line breaks (for authored short content). */
  breaks?: boolean;
}

export function MarkdownRenderer({
  content,
  breaks = false,
}: MarkdownRendererProps): React.ReactElement {
  const navigate = useNavigate();
  const api = useElectronAPI();
  const profileId = useUIStore((s) => s.activeProfileId);
  const html = useMemo(
    () => (breaks ? mdBreaks : md).render(content),
    [content, breaks],
  );

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#")) return; // in-page anchors, footnotes, etc.
    // Internal doc/share links open as an in-app tab; external → system browser.
    e.preventDefault();
    void openOutlineLink(href, { navigate, api, profileId });
  };

  return (
    <div
      className="markdown-body"
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default MarkdownRenderer;
