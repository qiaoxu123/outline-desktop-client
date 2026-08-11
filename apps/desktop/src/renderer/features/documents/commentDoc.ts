/**
 * 评论正文的 ProseMirror ↔ 文本转换。
 *
 * Outline 把评论正文存成 ProseMirror doc（`comment.data`）。客户端过去只做
 * 「递归取 text 字段」的拍平，结果是：列表符号没了、加粗/链接没了、代码块和
 * 相邻块粘成一行、`br` / image / mention 这类没有 text 的节点直接产出空串——
 * web 上排好版的评论到客户端就读不成句子。
 *
 * 这里提供两条路径：
 * - `proseToMarkdown`：给「读」用，转成 markdown 交给共享 MarkdownRenderer，
 *   与文档正文/随记同一套渲染，格式与 web 对齐。
 * - `proseToPlainText`：给「锚点提取」和「编辑草稿」用，保持既有纯文本语义。
 */

/** Outline 评论节点（结构化子集，未知类型一律按「有 content 就递归」处理）。 */
interface ProseNode {
  type?: string;
  text?: string;
  content?: unknown;
  attrs?: Record<string, unknown>;
  marks?: { type?: string; attrs?: Record<string, unknown> }[];
}

function asNode(v: unknown): ProseNode | null {
  return v && typeof v === "object" ? (v as ProseNode) : null;
}
function childrenOf(n: ProseNode): unknown[] {
  return Array.isArray(n.content) ? n.content : [];
}

/* ---------------- 纯文本（锚点提取 / 编辑草稿） ---------------- */

/**
 * 递归取纯文本。块级节点后补换行，让多段评论读起来仍是多行。
 * 保留原有语义：`deriveAnchorText` 靠它匹配 「…」 引用行。
 */
export function proseToPlainText(node: unknown): string {
  if (Array.isArray(node)) return node.map(proseToPlainText).join("");
  const n = asNode(node);
  if (!n) return "";
  if (typeof n.text === "string") return n.text;
  const inner = childrenOf(n).map(proseToPlainText).join("");
  return n.type === "paragraph" || n.type === "heading" ? `${inner}\n` : inner;
}

/* ---------------- Markdown（阅读） ---------------- */

/**
 * 文本节点 → markdown 字面量。
 *
 * PM 的 text 是**纯文本**，直接拼进 markdown 会被重新解释：评论里写
 * `**不该加粗**`、`- 这不是列表`、`# 这不是标题` 都会变成真的格式。转义只影响
 * 源码、不改变渲染出来的字，所以宁可多转不可漏转。
 *
 * 但不转义 `.`：URL 里的点一旦转义，linkify 就不再把裸链接变成可点链接。
 * 行首才有语义的字符（#、>、-、+、有序列表序号）只在行首转义，避免 `C#` 这类
 * 正常文字里出现多余反斜杠。
 *
 * **特意不转义 `$` `=` `~`**：它们不是标准 markdown 转义字符（CommonMark
 * 只规定了 \`\` `*` `_` `[` `]` `(` `)` `{` `}` `#` `+` `-` `.` `!` `|`）。
 *   - `$` 是 KaTeX 数学定界符，转义后公式无法渲染
 *   - `=` 只在行首整行 `===` 下划线时有语义，`\=` 不是标准转义，被 markdown-it
 *     渲染成字面量 `\=`（多出反斜杠）
 *   - `~` 单个无标记语义，GFM 删除线需要成对 `~~`，且已在 marks 层处理
 */
const ALWAYS_ESCAPE = /([\\`*_[\]<|])/g;
const LINE_START_ESCAPE = /^(\s*)([#>\-+])/;
const LINE_START_ORDERED = /^(\s*)(\d+)([.)])/;

function escapeMarkdown(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      line
        .replace(ALWAYS_ESCAPE, "\\$1")
        .replace(LINE_START_ESCAPE, "$1\\$2")
        .replace(LINE_START_ORDERED, "$1$2\\$3"),
    )
    .join("\n");
}

/** 还原 escapeMarkdown 的反斜杠，供「按纯文本显示」的场景使用。 */
export function unescapeMarkdown(text: string): string {
  return text.replace(/\\([!-/:-@[-`{-~])/g, "$1");
}

/** 行内 marks → markdown 包裹。顺序固定，避免 **`x`** / `**x**` 随机摇摆。 */
function applyMarks(text: string, marks: ProseNode["marks"]): string {
  if (!text) return text;
  const has = (t: string): boolean => !!marks?.some((m) => m.type === t);
  const isCode = has("code_inline") || has("code");
  // 行内代码里 markdown 语义本就失效，转义反而会显示出多余的反斜杠
  let out = isCode ? `\`${text}\`` : escapeMarkdown(text);
  if (!marks?.length) return out;
  if (has("strong") || has("bold")) out = `**${out}**`;
  if (has("em") || has("italic")) out = `*${out}*`;
  if (has("strikethrough") || has("strike")) out = `~~${out}~~`;
  if (has("highlight")) out = `==${out}==`;
  const link = marks.find((m) => m.type === "link");
  if (link) {
    const href = String(link.attrs?.href ?? "");
    // 含空格/括号的 href 会撑破 (…) 语法，用尖括号形式包住
    if (href) out = `[${out}](${/[\s()<>]/.test(href) ? `<${href}>` : href})`;
  }
  return out;
}

function inlineToMarkdown(nodes: unknown[]): string {
  return nodes
    .map((raw) => {
      const n = asNode(raw);
      if (!n) return "";
      if (typeof n.text === "string") return applyMarks(n.text, n.marks);
      switch (n.type) {
        case "br":
        case "hard_break":
          // markdown 硬换行：行尾两个空格
          return "  \n";
        case "image": {
          const src = String(n.attrs?.src ?? "");
          const alt = String(n.attrs?.alt ?? "");
          return src ? `![${alt}](${src})` : alt;
        }
        case "mention":
          return String(n.attrs?.label ?? n.attrs?.name ?? "");
        case "emoji":
          return String(n.attrs?.name ? `:${n.attrs.name}:` : "");
        default:
          // 未知行内节点：能递归就递归，别把内容吞掉
          return inlineToMarkdown(childrenOf(n));
      }
    })
    .join("");
}

/** 给块内每一行加前缀（引用 / 列表续行缩进）。 */
function prefixLines(text: string, first: string, rest: string): string {
  const lines = text.replace(/\n+$/, "").split("\n");
  return lines.map((l, i) => (i === 0 ? first : rest) + l).join("\n");
}

function listToMarkdown(node: ProseNode, ordered: boolean): string {
  const items = childrenOf(node);
  return (
    items
      .map((raw, i) => {
        const item = asNode(raw);
        if (!item) return "";
        const marker = ordered ? `${i + 1}. ` : "- ";
        const checked = item.attrs?.checked;
        const box =
          item.type === "checkbox_item" || typeof checked === "boolean"
            ? `[${checked ? "x" : " "}] `
            : "";
        const body = blocksToMarkdown(childrenOf(item)).replace(/\n+$/, "");
        return prefixLines(body, marker + box, " ".repeat(marker.length));
      })
      .filter(Boolean)
      .join("\n") + "\n\n"
  );
}

function blocksToMarkdown(nodes: unknown[]): string {
  let out = "";
  for (const raw of nodes) {
    const n = asNode(raw);
    if (!n) continue;
    switch (n.type) {
      case "paragraph": {
        const inline = inlineToMarkdown(childrenOf(n));
        // 空段落在 PM 里是有意义的间隔，但连续空段会撑出大片空白，这里直接跳过
        if (inline.trim()) out += `${inline}\n\n`;
        break;
      }
      case "heading": {
        const level = Math.min(6, Math.max(1, Number(n.attrs?.level ?? 1)));
        out += `${"#".repeat(level)} ${inlineToMarkdown(childrenOf(n))}\n\n`;
        break;
      }
      case "blockquote":
        out += `${prefixLines(blocksToMarkdown(childrenOf(n)), "> ", "> ")}\n\n`;
        break;
      case "bullet_list":
      case "bulletList":
      case "checkbox_list":
        out += listToMarkdown(n, false);
        break;
      case "ordered_list":
      case "orderedList":
        out += listToMarkdown(n, true);
        break;
      case "code_block":
      case "code_fence":
      case "codeBlock": {
        const lang = String(n.attrs?.language ?? n.attrs?.lang ?? "");
        const code = childrenOf(n)
          .map(proseToPlainText)
          .join("")
          .replace(/\n+$/, "");
        out += `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
        break;
      }
      case "hr":
      case "horizontal_rule":
      case "horizontalRule":
        out += "---\n\n";
        break;
      case "text":
      case "br":
      case "hard_break":
      case "image":
      case "mention":
      case "emoji":
        // 裸挂在块级位置的行内节点
        out += `${inlineToMarkdown([n])}\n\n`;
        break;
      default: {
        // 未知块级节点（表格、附件等）：递归其子节点，宁可样式退化也不丢内容
        const inner = blocksToMarkdown(childrenOf(n));
        if (inner.trim()) out += inner;
        break;
      }
    }
  }
  return out;
}

/** ProseMirror 评论文档 → markdown 源码。 */
export function proseToMarkdown(doc: unknown): string {
  const n = asNode(doc);
  if (!n) return "";
  const nodes = Array.isArray(doc) ? (doc as unknown[]) : childrenOf(n);
  // 不做 /\n{3,}/ 的全局折叠：每个块本就只补一个 "\n\n"，多余空行只可能来自
  // 代码块**内部**，全局折叠会把代码里的空行吃掉。
  return blocksToMarkdown(nodes).trim();
}

/* ---------------- 引用行拆分 ---------------- */

/**
 * 客户端建的评论没有服务端锚点（anchor mark 过不了 markdown 保存路径），
 * 选中的原文是以斜体 `「…」` 段落塞在正文开头的。网页版把锚定原文单独渲染成
 * 一条引用块、正文另起——这里把开头那行拆出来，好让客户端排出同样的层次。
 *
 * 只认「第一行整行就是引用」的情况；正文中间出现的 「…」 不动。
 */
export function splitQuoteLead(markdown: string): {
  quote: string | null;
  body: string;
} {
  const lines = markdown.split("\n");
  const first = lines[0]?.trim() ?? "";
  // proseToMarkdown 会把带 em 的引用行输出成 *「…」*
  const m = /^\*?「(.+)」\*?$/.exec(first);
  if (!m) return { quote: null, body: markdown };
  // 引用块是按纯文本渲染的，得把 escapeMarkdown 加的反斜杠还原，否则会显示出来
  return { quote: unescapeMarkdown(m[1]), body: lines.slice(1).join("\n").trim() };
}

/* ---------------- 编辑安全性 ---------------- */

/**
 * 编辑草稿走的是「纯文本 → 每行一个 paragraph」的重建（`buildCommentDoc`），
 * 只能无损承载「纯段落 + 「…」引用行」。若评论含列表 / 代码块 / 加粗 / 链接
 * 等结构，保存会把它们碾平成普通文字——与表格序列化那次数据丢失同类。
 * 这里识别出这种评论，让调用方禁用「编辑」而不是静默毁掉格式。
 */
const PLAIN_NODES = new Set(["doc", "paragraph", "text"]);
const PLAIN_MARKS = new Set(["em", "italic"]);

export function isRichComment(doc: unknown): boolean {
  const walk = (v: unknown): boolean => {
    if (Array.isArray(v)) return v.some(walk);
    const n = asNode(v);
    if (!n) return false;
    if (n.type && !PLAIN_NODES.has(n.type)) return true;
    if (n.marks?.some((m) => !m.type || !PLAIN_MARKS.has(m.type))) return true;
    return childrenOf(n).some(walk);
  };
  return walk(doc);
}
