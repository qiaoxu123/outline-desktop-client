import type { OutlineNode, OutlineDoc } from "./types";
import { makeNodeId } from "./types";

const INDENT = "  "; // 每层 2 空格

export function toMarkdown(root: OutlineNode[]): string {
  const lines: string[] = [];
  const walk = (nodes: OutlineNode[], depth: number): void => {
    const pad = INDENT.repeat(depth);
    for (const node of nodes) {
      lines.push(`${pad}- ${node.text}`);
      if (node.note) {
        // 备注对齐到 bullet 文本下方（缩进 + 2 空格），逐行输出。
        for (const noteLine of node.note.split("\n")) {
          lines.push(`${pad}${INDENT}${noteLine}`);
        }
      }
      if (node.children.length) walk(node.children, depth + 1);
    }
  };
  walk(root, 0);
  return lines.join("\n");
}

export function toExportMarkdown(doc: OutlineDoc): string {
  return `# ${doc.title}\n\n${toMarkdown(doc.root)}`;
}

interface Frame {
  node: OutlineNode;
  depth: number;
}

export function parseMarkdown(md: string): OutlineNode[] {
  const root: OutlineNode[] = [];
  const stack: Frame[] = []; // 栈顶是当前最深祖先
  let seq = 0;
  const nextId = (): string => makeNodeId(0, (++seq % 999999) / 1_000_000);

  const attach = (node: OutlineNode, depth: number): void => {
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    if (stack.length === 0) root.push(node);
    else stack[stack.length - 1].node.children.push(node);
    stack.push({ node, depth });
  };

  for (const raw of md.split("\n")) {
    if (raw.trim() === "") continue;
    const bullet = raw.match(/^(\s*)- (.*)$/);
    if (bullet) {
      const depth = Math.floor(bullet[1].length / INDENT.length);
      attach({ id: nextId(), text: bullet[2], collapsed: false, children: [] }, depth);
      continue;
    }
    // 非 bullet 行：归为栈顶节点的 note（去掉「其缩进 + 2 空格」的前缀近似）。
    const top = stack[stack.length - 1];
    if (top) {
      const line = raw.replace(/^\s+/, "");
      top.node.note = top.node.note ? `${top.node.note}\n${line}` : line;
    }
  }
  return root;
}
