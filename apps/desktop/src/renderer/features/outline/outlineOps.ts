import type { Block } from "./types";

/** 深度优先查找节点（返回引用，仅供读；写操作走 map 变换）。 */
export function findNode(root: Block[], id: string): Block | null {
  for (const node of root) {
    if (node.id === id) return node;
    const hit = findNode(node.children, id);
    if (hit) return hit;
  }
  return null;
}

/** 前序遍历所有可见节点：折叠节点自身可见，其子树不可见。 */
export function visibleNodesInOrder(root: Block[]): Block[] {
  const out: Block[] = [];
  const walk = (nodes: Block[]): void => {
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
  root: Block[],
  id: string,
  patch: (n: Block) => Block,
): Block[] {
  return root.map((node) => {
    if (node.id === id) return patch(node);
    if (node.children.length === 0) return node;
    const children = mapNode(node.children, id, patch);
    return children === node.children ? node : { ...node, children };
  });
}

export function setText(root: Block[], id: string, text: string): Block[] {
  return mapNode(root, id, (n) => ({ ...n, text }));
}

export function toggleCollapse(root: Block[], id: string): Block[] {
  return mapNode(root, id, (n) => ({ ...n, collapsed: !n.collapsed }));
}

/** 在与目标同层、目标之后插入新节点。 */
export function insertSiblingAfter(
  root: Block[],
  id: string,
  node: Block,
): Block[] {
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

/** 定位节点：返回其所在数组、下标、父节点（顶层父为 null）。 */
interface Loc {
  siblings: Block[];
  index: number;
  parent: Block | null;
}
function locate(root: Block[], id: string, parent: Block | null = null): Loc | null {
  const index = root.findIndex((x) => x.id === id);
  if (index >= 0) return { siblings: root, index, parent };
  for (const node of root) {
    const hit = locate(node.children, id, node);
    if (hit) return hit;
  }
  return null;
}

/** 用「替换某父节点 children」的方式重建树（父为 null 表示顶层）。 */
function replaceChildren(
  root: Block[],
  parentId: string | null,
  children: Block[],
): Block[] {
  if (parentId === null) return children;
  return root.map((node) => {
    if (node.id === parentId) return { ...node, children };
    if (node.children.length === 0) return node;
    const next = replaceChildren(node.children, parentId, children);
    return next === node.children ? node : { ...node, children: next };
  });
}

export function indent(root: Block[], id: string): Block[] {
  const loc = locate(root, id);
  if (!loc || loc.index === 0) return root; // 无前兄弟
  const node = loc.siblings[loc.index];
  const prev = loc.siblings[loc.index - 1];
  const newSiblings = loc.siblings.slice();
  newSiblings.splice(loc.index, 1);
  newSiblings[loc.index - 1] = { ...prev, children: [...prev.children, node] };
  return replaceChildren(root, loc.parent ? loc.parent.id : null, newSiblings);
}

export function outdent(root: Block[], id: string): Block[] {
  const loc = locate(root, id);
  if (!loc || loc.parent === null) return root; // 已在顶层
  const node = loc.siblings[loc.index];
  const parentLoc = locate(root, loc.parent.id);
  if (!parentLoc) return root;
  // 从父的 children 移除
  const withoutNode = replaceChildren(
    root,
    loc.parent.id,
    loc.siblings.filter((_, i) => i !== loc.index),
  );
  // 插到「父节点之后」的祖父层
  const insertAt = parentLoc.index + 1;
  // parentLoc.siblings 来自旧树；需要从 withoutNode 里重新取父层数组
  const freshParentLoc = locate(withoutNode, loc.parent.id);
  const targetSiblings = freshParentLoc ? freshParentLoc.siblings : withoutNode;
  const next = targetSiblings.slice();
  next.splice(insertAt, 0, node);
  return replaceChildren(
    withoutNode,
    freshParentLoc && freshParentLoc.parent ? freshParentLoc.parent.id : null,
    next,
  );
}

function swap(root: Block[], id: string, delta: -1 | 1): Block[] {
  const loc = locate(root, id);
  if (!loc) return root;
  const j = loc.index + delta;
  if (j < 0 || j >= loc.siblings.length) return root;
  const next = loc.siblings.slice();
  [next[loc.index], next[j]] = [next[j], next[loc.index]];
  return replaceChildren(root, loc.parent ? loc.parent.id : null, next);
}
export function moveUp(root: Block[], id: string): Block[] {
  return swap(root, id, -1);
}
export function moveDown(root: Block[], id: string): Block[] {
  return swap(root, id, 1);
}

export interface MergeResult {
  root: Block[];
  focusId: string | null;
  caretOffset: number;
}
export function mergeDelete(root: Block[], id: string): MergeResult {
  const order = visibleNodesInOrder(root);
  const pos = order.findIndex((x) => x.id === id);
  if (pos <= 0) return { root, focusId: null, caretOffset: 0 };
  const prev = order[pos - 1];
  const self = order[pos];
  const caretOffset = prev.text.length;
  const selfLoc = locate(root, id);
  const prevIsParent = selfLoc?.parent?.id === prev.id;

  // 上一节点接管 self 的子节点：
  // 若 prev 就是 self 的父节点，用 self 的子节点原位替换 self（保持文档顺序）；
  // 否则把 self 的子节点追加到 prev 的子节点末尾。
  const newPrevChildren = prevIsParent
    ? [
        ...prev.children.slice(0, selfLoc!.index),
        ...self.children,
        ...prev.children.slice(selfLoc!.index + 1),
      ]
    : [...prev.children, ...self.children];

  let next = setText(root, prev.id, prev.text + self.text);
  next = mapChildren(next, prev.id, newPrevChildren);
  if (!prevIsParent) next = removeNode(next, id); // prevIsParent 时 self 已被上面的切片移除
  return { root: next, focusId: prev.id, caretOffset };
}

/** 替换某节点自身的 children（内部工具）。 */
function mapChildren(root: Block[], id: string, children: Block[]): Block[] {
  return root.map((node) => {
    if (node.id === id) return { ...node, children };
    if (node.children.length === 0) return node;
    const next = mapChildren(node.children, id, children);
    return next === node.children ? node : { ...node, children: next };
  });
}

function removeNode(root: Block[], id: string): Block[] {
  const filtered = root.filter((x) => x.id !== id);
  if (filtered.length !== root.length) return filtered;
  return root.map((node) => {
    if (node.children.length === 0) return node;
    const next = removeNode(node.children, id);
    return next === node.children ? node : { ...node, children: next };
  });
}

function isDescendant(node: Block, maybeChildId: string): boolean {
  for (const c of node.children) {
    if (c.id === maybeChildId || isDescendant(c, maybeChildId)) return true;
  }
  return false;
}

export function dragMove(
  root: Block[],
  id: string,
  targetParentId: string | null,
  index: number,
): Block[] {
  if (id === targetParentId) return root;
  const node = findNode(root, id);
  if (!node) return root;
  if (targetParentId && isDescendant(node, targetParentId)) return root; // 禁止移进自身子树
  // 摘除
  const without = removeNode(root, id);
  // 目标 children
  const targetChildren =
    targetParentId === null ? without : findNode(without, targetParentId)?.children ?? null;
  if (targetChildren === null) return root;
  const nextChildren = targetChildren.slice();
  const clamped = Math.max(0, Math.min(index, nextChildren.length));
  nextChildren.splice(clamped, 0, node);
  return replaceChildren(without, targetParentId, nextChildren);
}
