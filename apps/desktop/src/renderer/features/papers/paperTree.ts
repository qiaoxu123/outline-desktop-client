/**
 * 论文库的树形约定（纯函数，不依赖 React —— 便于单测）。
 *
 * 服务器上的目录习惯是人维护的，客户端只负责「按约定把叶子文档识别成论文」：
 * - 推荐阅读：年/月 文件夹是容器，其余节点即论文
 * - 精选论文 / 精选专题 / 同行成果：文件夹是容器，只有 📖 开头的才是论文
 * - 组内工作：整棵树里所有 📖 文档
 *
 * 这些约定极易在后续改动中被悄悄破坏（少判一个前缀、漏一个标题），故单独成文
 * 件并配回归测试。
 */
import type { OutlineCollectionDocument } from "@outline/shared-types";

export interface PaperEntry {
  id: string;
  title: string;
  emoji: string | null;
  /** From the ancestor folder titles, e.g. 2026 / 7. */
  year: number | null;
  month: number | null;
  /** 无年月的论文所属分组：精选=专题名，组内工作=固定值，同行成果=团队名。 */
  topic?: string | null;
  /** 论文来源分区，决定卡片上的归属标签（此前靠 topic 值反推「组内工作」）。 */
  source?: "featured" | "internal" | "peer";
}

export const YEAR_RE = /(\d{4})\s*年/;
export const MONTH_RE = /^(\d{1,2})\s*月/;
export const FEATURED_TITLE = "精选论文";
/** 精选专题 was split out of 扩展学习 into its own top-level collection; its
 * tree is topic folders (专题) containing 📖 papers — same shape as the old
 * 精选论文 subtree, so collectFeatured handles it. */
export const FEATURED_COLLECTION_TITLE = "精选专题";
/** 扩展学习 下的「同行成果」：树形是 团队文件夹 → 📖 论文，与 精选论文 同形，
 * 因此复用 collectFeatured，topic 自然落成团队名（如「浙大高飞团队」）。 */
export const PEER_TITLE = "同行成果";

/** Walk the 推荐阅读 subtree: 年/月 folders are containers, everything else
 * is a paper entry (its own children, if any, are appendices — not papers). */
export function collectPapers(
  nodes: OutlineCollectionDocument[],
  year: number | null,
  month: number | null,
  out: PaperEntry[],
): void {
  for (const n of nodes) {
    const title = (n.title ?? "").trim();
    const y = YEAR_RE.exec(title);
    const m = MONTH_RE.exec(title);
    if (y) {
      collectPapers(n.children ?? [], parseInt(y[1], 10), month, out);
    } else if (m) {
      collectPapers(n.children ?? [], year, parseInt(m[1], 10), out);
    } else {
      out.push({ id: n.id, title, emoji: n.emoji ?? null, year, month });
    }
  }
}

/**
 * Walk the 精选论文 subtree: topic folders are containers, only 📖-prefixed
 * docs are papers (topic overview pages are not). Without this, papers filed
 * under 精选论文 were invisible to the library (only findable via global
 * search). `topic` = the first-level 专题 title.
 *
 * NB: a 📖 paper's descendants are STILL walked, because users often file a
 * new paper directly under another 📖 paper — those nested 📖 docs are real
 * papers, not appendices, and must be collected too (only 📖-prefixed nodes
 * are ever pushed, so genuine non-📖 appendices are naturally ignored). The
 * topic carried into a paper's subtree stays the nearest non-📖 folder.
 */
export function collectFeatured(
  nodes: OutlineCollectionDocument[],
  topic: string | null,
  out: PaperEntry[],
  source: PaperEntry["source"] = "featured",
): void {
  for (const n of nodes) {
    const title = (n.title ?? "").trim();
    if (title.startsWith("📖")) {
      out.push({
        id: n.id,
        title,
        emoji: n.emoji ?? null,
        year: null,
        month: null,
        topic,
        source,
      });
      // keep same topic — a paper nested here belongs to the same 专题
      collectFeatured(n.children ?? [], topic, out, source);
      continue;
    }
    collectFeatured(n.children ?? [], topic ?? title, out, source);
  }
}

/** 组内工作 collection (separate from 扩展学习): collect every 📖-prefixed
 * doc anywhere in its tree as a paper, tagged with a fixed 组内工作 topic. */
export const INTERNAL_WORK_TITLE = "组内工作";
export function collectInternalWork(
  nodes: OutlineCollectionDocument[],
  out: PaperEntry[],
): void {
  for (const n of nodes) {
    const title = (n.title ?? "").trim();
    if (title.startsWith("📖")) {
      out.push({
        id: n.id,
        title,
        emoji: n.emoji ?? null,
        year: null,
        month: null,
        topic: "组内工作",
        source: "internal",
      });
      // still descend: a paper filed under another 📖 is a real paper too
      collectInternalWork(n.children ?? [], out);
      continue;
    }
    collectInternalWork(n.children ?? [], out);
  }
}
