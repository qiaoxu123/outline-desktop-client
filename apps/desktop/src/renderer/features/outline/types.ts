import type { StoreItem } from "../../hooks/useWebdavStore";

export const OUTLINE_VERSION = 1;

/**
 * 一个块（Logseq block）：大纲的最小单位。text 是原始 markdown（可含软换行 \n）。
 * collapsed 折叠状态持久化（Logseq 折叠是持久的）。
 */
export interface Block {
  id: string;
  text: string;
  collapsed: boolean;
  children: Block[];
}

/** 一页大纲。满足 useWebdavStore 的 StoreItem（id/updatedAt/deletedAt）。 */
export interface Page extends StoreItem {
  title: string;
  root: Block[];
  createdAt: string;
  pinned?: boolean;
}

export interface OutlineFile {
  version: number;
  pages: Page[];
}

/**
 * 每用户私有单文件。用新路径 `大纲笔记/` 与 v1.14.0 的旧 `大纲/` 数据彻底隔离
 * （旧属实验数据，不迁移）。
 */
export function outlineFilePath(userId: string): string {
  return `大纲笔记/${userId}.json`;
}

/** localStorage 镜像 key，用于 WebDAV 就绪前即时上屏。 */
export function outlineCacheKey(userId: string): string {
  return `outline2.cache.${userId}.v1`;
}

/** 稳定 id：与 notes.makeId 同风格，前缀区分。 */
export function makeBlockId(nowMs: number, rand: number): string {
  const r = Math.floor(rand * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `ob_${nowMs}_${r}`;
}

export function emptyBlock(id: string): Block {
  return { id, text: "", collapsed: false, children: [] };
}
