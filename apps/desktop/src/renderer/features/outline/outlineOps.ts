import type { OutlineNode } from "./types";

/** 深度优先查找节点（返回引用，仅供读；写操作走 map 变换）。 */
export function findNode(root: OutlineNode[], id: string): OutlineNode | null {
  for (const node of root) {
    if (node.id === id) return node;
    const hit = findNode(node.children, id);
    if (hit) return hit;
  }
  return null;
}

/** 前序遍历所有可见节点：折叠节点自身可见，其子树不可见。 */
export function visibleNodesInOrder(root: OutlineNode[]): OutlineNode[] {
  const out: OutlineNode[] = [];
  const walk = (nodes: OutlineNode[]): void => {
    for (const node of nodes) {
      out.push(node);
      if (!node.collapsed) walk(node.children);
    }
  };
  walk(root);
  return out;
}

/** 对匹配 id 的节点应用 patch，返回新树（不可变）。 */
function mapNode(
  root: OutlineNode[],
  id: string,
  patch: (n: OutlineNode) => OutlineNode,
): OutlineNode[] {
  return root.map((node) => {
    if (node.id === id) return patch(node);
    if (node.children.length === 0) return node;
    const children = mapNode(node.children, id, patch);
    return children === node.children ? node : { ...node, children };
  });
}

export function setText(root: OutlineNode[], id: string, text: string): OutlineNode[] {
  return mapNode(root, id, (n) => ({ ...n, text }));
}

export function setNote(root: OutlineNode[], id: string, note: string): OutlineNode[] {
  return mapNode(root, id, (n) => ({ ...n, note }));
}

export function toggleCollapse(root: OutlineNode[], id: string): OutlineNode[] {
  return mapNode(root, id, (n) => ({ ...n, collapsed: !n.collapsed }));
}

/** 在与目标同层、目标之后插入新节点。 */
export function insertSiblingAfter(
  root: OutlineNode[],
  id: string,
  node: OutlineNode,
): OutlineNode[] {
  const idx = root.findIndex((x) => x.id === id);
  if (idx >= 0) {
    const next = root.slice();
    next.splice(idx + 1, 0, node);
    return next;
  }
  return root.map((x) => {
    if (x.children.length === 0) return x;
    const children = insertSiblingAfter(x.children, id, node);
    return children === x.children ? x : { ...x, children };
  });
}
