import type { Block, Page } from "./types";
import { makeBlockId } from "./types";

const INDENT = "  "; // 每层 2 空格

/** 块树 → 嵌套 `- ` markdown（用于导出/复制）。块内软换行以缩进续写行输出。 */
export function toMarkdown(root: Block[]): string {
  const lines: string[] = [];
  const walk = (blocks: Block[], depth: number): void => {
    const pad = INDENT.repeat(depth);
    for (const b of blocks) {
      const [first, ...rest] = b.text.split("\n");
      lines.push(`${pad}- ${first ?? ""}`);
      for (const cont of rest) lines.push(`${pad}${INDENT}${cont}`);
      if (b.children.length) walk(b.children, depth + 1);
    }
  };
  walk(root, 0);
  return lines.join("\n");
}

export function toExportMarkdown(page: Page): string {
  return `# ${page.title}\n\n${toMarkdown(page.root)}`;
}

/** 前导空白的“列数”：tab 与空格都各计 1，仅用于相对层级比较。 */
function leadingIndent(line: string): number {
  let cols = 0;
  for (const ch of line) {
    if (ch === "\t" || ch === " ") cols += 1;
    else break;
  }
  return cols;
}

/** 去掉行首空白后，再去掉可选的项目符号/编号前缀（`- ` / `* ` / `• ` / `1. ` 等）。 */
function stripBullet(line: string): string {
  return line
    .replace(/^\s+/, "")
    .replace(/^([-*•‣◦]\s+|\d+[.)]\s+)/, "");
}

/**
 * 把粘贴进来的多层大纲文本解析成块树。按**相对缩进**判层级，兼容 tab 或空格缩进、
 * 带或不带项目符号（幕布/Logseq/普通大纲复制的文本都覆盖）。每一非空行 = 一个块。
 */
export function parsePastedOutline(text: string): Block[] {
  const root: Block[] = [];
  const stack: { block: Block; indent: number }[] = [];
  let seq = 0;
  const nextId = (): string => makeBlockId(0, (++seq % 999999) / 1_000_000);

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (raw.trim() === "") continue;
    const indent = leadingIndent(raw);
    const block: Block = {
      id: nextId(),
      text: stripBullet(raw),
      collapsed: false,
      children: [],
    };
    // 弹出所有缩进 >= 当前的祖先，剩下的栈顶即父。
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    if (stack.length === 0) root.push(block);
    else stack[stack.length - 1].block.children.push(block);
    stack.push({ block, indent });
  }
  return root;
}
