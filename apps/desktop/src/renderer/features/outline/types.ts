import type { StoreItem } from "../../hooks/useWebdavStore";

export const OUTLINE_VERSION = 1;

export interface OutlineNode {
  id: string;
  /** 标题行的内联 markdown 源码（加粗/==高亮==/链接等）。 */
  text: string;
  /** 备注：节点下的长文本 markdown，可选。 */
  note?: string;
  /** 折叠状态：仅视图态，不进导出 markdown。 */
  collapsed: boolean;
  children: OutlineNode[];
}

/** 满足 useWebdavStore 的 StoreItem（id/updatedAt/deletedAt）。 */
export interface OutlineDoc extends StoreItem {
  title: string;
  root: OutlineNode[];
  createdAt: string;
  pinned?: boolean;
}

export interface OutlineFile {
  version: number;
  outlines: OutlineDoc[];
}

/** 每用户私有单文件，位于共享 WebDAV 根下。 */
export function outlineFilePath(userId: string): string {
  return `大纲/${userId}.json`;
}

/** localStorage 镜像 key，用于 WebDAV 就绪前即时上屏。 */
export function outlineCacheKey(userId: string): string {
  return `outline.cache.${userId}.v1`;
}

/** 稳定 id：与 notes.makeId 同风格，前缀区分。 */
export function makeNodeId(nowMs: number, rand: number): string {
  const r = Math.floor(rand * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `on_${nowMs}_${r}`;
}

export function emptyNode(id: string): OutlineNode {
  return { id, text: "", collapsed: false, children: [] };
}
