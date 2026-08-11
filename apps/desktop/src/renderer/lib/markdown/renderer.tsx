import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { renderMermaidIn } from "./mermaid";
import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";
import katexPlugin from "@vscode/markdown-it-katex";
import highlightRule from "./highlightRule";
import hljs from "highlight.js";
import { absoluteAttachmentUrl } from "../server";
import { parseImageTitle } from "./imageTitle";
import { normalizeOutlineMarkdown } from "./normalize";
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
      // mermaid 交给 renderMermaidIn 后处理成 SVG：输出带标记类、保留原始源码。
      if (lang === "mermaid") {
        return '<pre class="mermaid-src">' + inst.utils.escapeHtml(str) + "</pre>";
      }
      if (lang && hljs.getLanguage(lang)) {
        try {
          return (
            '<pre class="hljs" data-lang="' +
            inst.utils.escapeHtml(lang) +
            '"><code>' +
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
  // ==highlight== → <mark>, using Outline's own rule (see highlightRule) so
  // adjacent highlights (==a====b==) parse correctly, matching web.
  inst.use(highlightRule);

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

const NT_TAG_PREFIX = "#nt-tag-";
// #标签：# 后跟非空白、非常见中英标点的连续字符（与 noteUtils.parseTags 对齐）。
const NOTE_TAG_RE = /#([^\s#.,;!?，。；！？、）)\]】]+)/g;

/**
 * 把裸 #标签 预处理成锚点链接 `[#标签](#nt-tag-ENC)`，交给 markdown-it 正常渲染，
 * 点击时由 onClick 拦截 → onTagClick。仅在传入 onTagClick 时启用（随记卡片专用），
 * 文档渲染路径不受影响。
 */
function transformNoteTags(src: string): string {
  return src.replace(
    NOTE_TAG_RE,
    (_m, t: string) => `[#${t}](${NT_TAG_PREFIX}${encodeURIComponent(t)})`,
  );
}

interface MarkdownRendererProps {
  content: string;
  /** Render single newlines as line breaks (for authored short content). */
  breaks?: boolean;
  /** 传入后：正文内 #标签 渲染为可点击 chip，点击回调此函数（随记专用）。 */
  onTagClick?: (tag: string) => void;
}

export function MarkdownRenderer({
  content,
  breaks = false,
  onTagClick,
}: MarkdownRendererProps): React.ReactElement {
  const navigate = useNavigate();
  const api = useElectronAPI();
  const profileId = useUIStore((s) => s.activeProfileId);
  const bodyRef = useRef<HTMLDivElement>(null);
  // 仅「是否启用标签转换」影响输出，与回调身份无关，避免每次渲染重算 HTML。
  const tagsEnabled = !!onTagClick;
  const html = useMemo(() => {
    const normalized = normalizeOutlineMarkdown(content);
    const source = tagsEnabled ? transformNoteTags(normalized) : normalized;
    return (breaks ? mdBreaks : md).render(source);
  }, [content, breaks, tagsEnabled]);

  // 渲染后把 ```mermaid 代码块替换成 SVG 流程图（内容变化时重跑）。
  useEffect(() => {
    if (bodyRef.current) void renderMermaidIn(bodyRef.current);
  }, [html]);

  // 给代码块注入右上角复制按钮（内容变化时重跑，幂等）。
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.querySelectorAll("pre.hljs").forEach((pre) => {
      if (pre.querySelector(":scope > .code-block-copy")) return;
      const btn = document.createElement("button");
      btn.className = "code-block-copy";
      btn.type = "button";
      btn.title = "复制代码";
      btn.setAttribute("aria-label", "复制代码");
      btn.innerHTML =
        '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.5v-1A1.5 1.5 0 0 0 9 1H3a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 3 11h1"/></svg>';
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const code = pre.querySelector("code")?.textContent ?? "";
        void navigator.clipboard.writeText(code).then(() => {
          const icon = btn.innerHTML;
          btn.innerHTML = "✓";
          btn.classList.add("copied");
          setTimeout(() => {
            btn.innerHTML = icon;
            btn.classList.remove("copied");
          }, 1200);
        });
      });
      pre.appendChild(btn);
    });
  }, [html]);

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href) return;
    // 随记 #标签：拦截并回调筛选，不走链接跳转。
    if (onTagClick && href.startsWith(NT_TAG_PREFIX)) {
      e.preventDefault();
      onTagClick(decodeURIComponent(href.slice(NT_TAG_PREFIX.length)));
      return;
    }
    if (href.startsWith("#")) return; // in-page anchors, footnotes, etc.
    // Internal doc/share links open as an in-app tab; external → system browser.
    e.preventDefault();
    void openOutlineLink(href, { navigate, api, profileId });
  };

  return (
    <div
      ref={bodyRef}
      className="markdown-body"
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * 内联渲染一行 markdown（加粗/斜体/==高亮==/链接/行内代码/行内公式），
 * 不产生块级 <p> 包裹，供大纲节点标题这类单行内容使用。复用主 md 实例。
 */
export function renderInlineMarkdown(text: string): string {
  return md.renderInline(normalizeOutlineMarkdown(text));
}

export default MarkdownRenderer;
