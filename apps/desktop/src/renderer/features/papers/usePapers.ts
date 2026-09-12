import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUIStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { useUserInfo } from "../../hooks/useOutline";
import { unwrapIpc } from "../../lib/ipc";
import { readProfileStorage, writeProfileStorage } from "../../lib/profileStorage";
import type {
  OutlineCollection,
  OutlineCollectionDocument,
  OutlineDocument,
} from "@outline/shared-types";
// 树形约定与遍历在 paperTree.ts（纯函数，可单测）；此处透传导出以免调用方改导入。
import {
  collectPapers,
  collectFeatured,
  collectInternalWork,
  FEATURED_TITLE,
  FEATURED_COLLECTION_TITLE,
  PEER_TITLE,
  INTERNAL_WORK_TITLE,
  type PaperEntry,
} from "./paperTree";
export type { PaperEntry } from "./paperTree";

/**
 * Paper library — same philosophy as 讨论区/个人笔记: the server keeps its
 * existing 年/月 folder habit untouched; the client walks the 推荐阅读 tree
 * and turns leaf documents into searchable entries. Deep metadata (领域 tags,
 * venue, arXiv link) is parsed from each paper's attribute table.
 */

const ROOT_KEY = "papers.root";
const ROOT_TITLE = "推荐阅读";
const READ_KEY = "papers.read";

export interface PapersRoot {
  collectionId: string;
  docId: string;
}

export function usePapersRoot(): {
  root: PapersRoot | null;
  status: "resolving" | "ready" | "error";
} {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const [root, setRoot] = useState<PapersRoot | null>(null);
  const [status, setStatus] = useState<"resolving" | "ready" | "error">("resolving");

  useEffect(() => {
    if (!activeProfileId) {
      setRoot(null);
      setStatus("resolving");
      return;
    }
    try {
      const raw = readProfileStorage(activeProfileId, ROOT_KEY);
      const cached = raw ? (JSON.parse(raw) as PapersRoot) : null;
      setRoot(cached);
      setStatus(cached ? "ready" : "resolving");
    } catch {
      setRoot(null);
      setStatus("resolving");
    }
  }, [activeProfileId]);

  useEffect(() => {
    if (root || !activeProfileId) return;
    let cancelled = false;
    const resolve = async () => {
      try {
        const cols = (
          await unwrapIpc<{ data: OutlineCollection[] }>(
            api.collections.list(activeProfileId),
          )
        ).data;
        // The root can live in any collection. Fetch the trees concurrently;
        // the previous serial scan made the first visit wait for every
        // collection in sequence.
        const trees = await Promise.all(
          (cols ?? []).map(async (col) => ({
            collectionId: col.id,
            tree: (
              await unwrapIpc<{ data: OutlineCollectionDocument[] }>(
                api.collections.documents(activeProfileId, col.id),
              )
            ).data,
          })),
        );
        for (const { collectionId, tree } of trees) {
          const stack = [...(tree ?? [])];
          while (stack.length) {
            const node = stack.pop()!;
            if ((node.title ?? "").trim() === ROOT_TITLE) {
              const hit = { collectionId, docId: node.id };
              writeProfileStorage(activeProfileId, ROOT_KEY, JSON.stringify(hit));
              if (!cancelled) {
                setRoot(hit);
                setStatus("ready");
              }
              return;
            }
            stack.push(...(node.children ?? []));
          }
        }
        if (!cancelled) setStatus("error");
      } catch {
        if (!cancelled) setStatus("error");
      }
    };
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [api, activeProfileId, root]);

  return { root, status };
}

const TREE_CACHE_KEY = "papers.treeCache.v1";

interface TreeCache {
  savedAt: string;
  collectionId: string;
  tree: OutlineCollectionDocument[];
}

function readTreeCache(profileId: string | null, collectionId: string): TreeCache | null {
  try {
    const raw = readProfileStorage(profileId, TREE_CACHE_KEY);
    const cache = raw ? (JSON.parse(raw) as TreeCache) : null;
    return cache?.collectionId === collectionId ? cache : null;
  } catch {
    return null;
  }
}

export function usePaperEntries(root: PapersRoot | null): {
  papers: PaperEntry[];
  isLoading: boolean;
} {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const { data, isLoading } = useQuery({
    queryKey: [
      "profile",
      activeProfileId,
      "collection",
      root?.collectionId,
      "documents",
    ],
    queryFn: async () => {
      const res = await unwrapIpc<{ data: OutlineCollectionDocument[] }>(
        api.collections.documents(activeProfileId!, root!.collectionId),
      );
      try {
        const cache: TreeCache = {
          savedAt: new Date().toISOString(),
          collectionId: root!.collectionId,
          tree: res.data,
        };
        writeProfileStorage(activeProfileId, TREE_CACHE_KEY, JSON.stringify(cache));
      } catch {
        // best-effort, same as the meta cache
      }
      return res;
    },
    enabled: !!activeProfileId && !!root,
    // Paint instantly from the persisted snapshot (survives restart AND the
    // 5-min query GC that made every reopen show 加载论文列表…); marked stale
    // by its saved timestamp so a silent background refresh still runs.
    initialData: () => {
      const cache = root ? readTreeCache(activeProfileId, root.collectionId) : null;
      return cache ? { data: cache.tree } : undefined;
    },
    initialDataUpdatedAt: () => {
      const cache = root ? readTreeCache(activeProfileId, root.collectionId) : null;
      return cache ? new Date(cache.savedAt).getTime() : 0;
    },
  });

  // Paper collections that live OUTSIDE 扩展学习 — resolved by name in one pass:
  //  • 组内工作: its 📖 解读 docs
  //  • 精选专题: topic-organised 📖 papers (split out of the old 精选论文 subtree)
  const { data: extraData } = useQuery({
    queryKey: ["profile", activeProfileId, "extra-paper-collections"],
    queryFn: async () => {
      const cols =
        (
          await unwrapIpc<{ data: OutlineCollection[] }>(
            api.collections.list(activeProfileId!),
          )
        ).data ?? [];
      const load = async (id?: string): Promise<OutlineCollectionDocument[]> =>
        id
          ? (
              await unwrapIpc<{ data: OutlineCollectionDocument[] }>(
                api.collections.documents(activeProfileId!, id),
              )
            ).data ?? []
          : [];
      const iw = cols.find((c) => (c.name ?? "").trim() === INTERNAL_WORK_TITLE);
      const featured = cols.find(
        (c) => (c.name ?? "").trim() === FEATURED_COLLECTION_TITLE,
      );
      const [iwTree, featuredTree] = await Promise.all([
        load(iw?.id),
        load(featured?.id),
      ]);
      return { iwTree, featuredTree };
    },
    enabled: !!activeProfileId,
    staleTime: 10 * 60_000,
  });

  const papers: PaperEntry[] = [];
  if (root && data?.data) {
    const stack = [...data.data];
    while (stack.length) {
      const node = stack.pop()!;
      if (node.id === root.docId) {
        collectPapers(node.children ?? [], null, null, papers);
        continue; // don't descend again
      }
      if ((node.title ?? "").trim() === FEATURED_TITLE) {
        collectFeatured(node.children ?? [], null, papers);
        continue;
      }
      if ((node.title ?? "").trim() === PEER_TITLE) {
        collectFeatured(node.children ?? [], null, papers, "peer");
        continue;
      }
      stack.push(...(node.children ?? []));
    }
  }
  if (extraData?.iwTree?.length) collectInternalWork(extraData.iwTree, papers);
  if (extraData?.featuredTree?.length)
    collectFeatured(extraData.featuredTree, null, papers);
  const unique = [...new Map(papers.map((paper) => [paper.id, paper])).values()];
  // Newest recommendation first; undated (精选/组内工作) papers sort last.
  unique.sort(
    (a, b) => (b.year ?? 0) - (a.year ?? 0) || (b.month ?? 0) - (a.month ?? 0),
  );
  return { papers: unique, isLoading };
}

/* ---------- per-paper metadata from the attribute table ---------- */

export interface PaperMeta {
  tags: string[];
  venue: string | null;
  link: string | null;
  /** Open-source repo URL (parsed from the 代码仓库 row) — shown as a code badge. */
  code: string | null;
  authors: string | null;
  org: string | null;
  /** English paper title (from the 论文标题 row) — titles in the library are
   * Chinese translations, so this is what makes English-title search work. */
  enTitle: string | null;
  /** Document last-updated time — the single ordering key for the whole
   * library (年/月 folders are no longer used to sort or filter). */
  updatedAt: string | null;
  /** This document's own urlId (from documents.list). */
  urlId: string | null;
  /** urlIds of other documents referenced in this paper's body (dedup'd) —
   * feeds the 论文关系图 (backlink graph). */
  outLinks: string[];
  parsed: boolean;
}

/** Clean an English-title cell: unwrap `[text](url)`, strip markdown emphasis
 * and surrounding quotes. Returns null for empty/placeholder values. */
function normalizeEnTitle(raw: string | null): string | null {
  if (!raw) return null;
  let s = raw.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"); // [Title](url) → Title
  s = s.replace(/[*_`]/g, "").replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "").trim();
  if (!s || /^(无|n\/?a|none|-|—)$/i.test(s)) return null;
  return s;
}

export function parsePaperMeta(text: string): PaperMeta {
  const fields = new Map<string, string>();
  for (const line of text.split("\n").slice(0, 40)) {
    const m = /^\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*$/.exec(line.trim());
    if (m && !/^[-\s:]+$/.test(m[1])) fields.set(m[1].trim(), m[2].trim());
  }
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      for (const [name, v] of fields) {
        if (name.includes(k)) return v;
      }
    }
    return null;
  };
  const rawTags = pick("领域", "方向", "标签");
  const rawLink = pick("论文链接", "链接");
  const linkMatch = rawLink ? /\((https?:\/\/[^)]+)\)/.exec(rawLink) : null;
  const rawCode = pick("代码仓库", "代码", "源码", "GitHub");
  const codeMatch = rawCode ? /\((https?:\/\/[^)]+)\)/.exec(rawCode) : null;
  return {
    tags: rawTags
      ? rawTags
          .split(/[,，、;；|]/)
          .map((t) => t.replace(/[*_`]/g, "").trim())
          .filter((t) => t.length > 0 && t.length < 40)
      : [],
    venue: pick("发表时间", "发表", "venue"),
    link: linkMatch?.[1] ?? (rawLink && /^https?:/.test(rawLink) ? rawLink : null),
    code: codeMatch?.[1] ?? (rawCode && /^https?:/.test(rawCode) ? rawCode : null),
    authors: pick("作者"),
    org: pick("机构"),
    enTitle: normalizeEnTitle(
      pick("论文标题", "英文标题", "原文标题", "原标题", "英文题目", "标题", "Title"),
    ),
    updatedAt: null, // filled by usePaperMetas from the documents.list payload
    urlId: null, // filled by usePaperMetas from the documents.list payload
    outLinks: [], // filled by usePaperMetas from the documents.list payload
    parsed: fields.size > 0,
  };
}

/** Extract the urlIds of all in-app doc links (`/doc/<slug>`) in a body;
 * the urlId is the last `-`-separated segment of the slug. */
export function extractOutLinks(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\/doc\/([A-Za-z0-9一-鿿-]+)/g)) {
    const slug = m[1];
    const urlId = slug.slice(slug.lastIndexOf("-") + 1);
    if (urlId) out.add(urlId);
  }
  return [...out];
}

/* ---------- shared likes / star ratings ---------- */

// Legacy: interactions used to live in an Outline doc titled with this prefix.
// It now lives on WebDAV (see usePaperInteractions); the prefix is kept only so
// any leftover/unarchived registry doc is never mistaken for a paper.
const REGISTRY_TITLE_PREFIX = "⚙️ 论文互动数据";

export interface InteractionEntry {
  name: string;
  like?: boolean;
  /** 1-5 stars */
  score?: number;
  at: string;
}

export interface InteractionData {
  version: 1;
  /** paperDocId -> userId -> entry */
  papers: Record<string, Record<string, InteractionEntry>>;
}

const EMPTY_INTERACTIONS: InteractionData = { version: 1, papers: {} };

// v4: added enTitle (English title) so search can match untranslated titles.
// v6: added updatedAt — the single sort key for the whole library.
// v7: added urlId + outLinks — feeds the 论文关系图.
const META_CACHE_KEY = "papers.metaCache.v7";

interface MetaCache {
  savedAt: string;
  metas: Record<string, PaperMeta>;
}

function readMetaCache(profileId: string | null): MetaCache | null {
  try {
    const raw = readProfileStorage(profileId, META_CACHE_KEY);
    return raw ? (JSON.parse(raw) as MetaCache) : null;
  } catch {
    return null;
  }
}

/**
 * Metadata for ALL papers in one query: pages through documents.list for the
 * whole collection (~4 requests for 331 docs, text included) and parses every
 * attribute table in one pass. The result persists to localStorage so
 * reopening the view is instant (cache first, silent refresh in background).
 * Replaces the previous per-document fan-out (60 concurrent documents.info
 * calls, each re-rendering the list — the source of the open lag).
 */
export interface PapersMetaResult {
  metas: Record<string, PaperMeta>;
}

export function papersMetaQueryKey(
  activeProfileId: string | null,
  collectionId: string | undefined,
): unknown[] {
  return ["profile", activeProfileId, "papers-meta", collectionId];
}

export function usePaperMetas(root: PapersRoot | null): {
  metas: Map<string, PaperMeta>;
} {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);

  const { data } = useQuery({
    queryKey: papersMetaQueryKey(activeProfileId, root?.collectionId),
    queryFn: async (): Promise<PapersMetaResult> => {
      const metas: Record<string, PaperMeta> = {};
      // scan the papers collection (扩展学习) + 组内工作 so both sets get
      // parsed metadata (tags / venue / link)
      const cols = (
        await unwrapIpc<{ data: OutlineCollection[] }>(
          api.collections.list(activeProfileId!),
        )
      ).data;
      const iw = (cols ?? []).find(
        (c) => (c.name ?? "").trim() === INTERNAL_WORK_TITLE,
      );
      const featured = (cols ?? []).find(
        (c) => (c.name ?? "").trim() === FEATURED_COLLECTION_TITLE,
      );
      const scanIds = [
        root!.collectionId,
        ...(iw ? [iw.id] : []),
        ...(featured ? [featured.id] : []),
      ];
      const scanCollection = async (cid: string) => {
        const collectionMetas: Record<string, PaperMeta> = {};
        // 扩展学习 alone holds >1000 docs; the old 1000 cap left ~34 papers with
        // no metadata → un-dated → mis-sorted. Page far enough to cover the whole
        // collection (the inner loop still breaks early once a page is short).
        for (let offset = 0; offset < 5000; offset += 100) {
          const page = await unwrapIpc<{ data: OutlineDocument[] }>(
            api.call(activeProfileId!, "documents.list", {
              collectionId: cid,
              limit: 100,
              offset,
            }),
          );
          const docs = page.data ?? [];
          for (const d of docs) {
            // skip any leftover legacy interaction registry doc
            if ((d.title ?? "").startsWith(REGISTRY_TITLE_PREFIX)) continue;
            if (typeof d.text === "string")
              collectionMetas[d.id] = {
                ...parsePaperMeta(d.text),
                updatedAt: d.updatedAt ?? null,
                urlId: d.urlId ?? null,
                // Only 📖 papers feed the citation graph, so only scan their
                // full text for out-links. Skipping this for the hundreds of
                // structural docs (year/month/index nodes) removes the bulk of
                // the per-doc full-text regex scan that froze the main thread
                // while the metas refetch ran.
                outLinks:
                  (d.title ?? "").startsWith("📖") ? extractOutLinks(d.text) : [],
              };
          }
          if (docs.length < 100) break;
        }
        return collectionMetas;
      };
      // Pages within one collection remain ordered, but independent
      // collections no longer block each other.
      const scanned = await Promise.all(scanIds.map(scanCollection));
      for (const collectionMetas of scanned) Object.assign(metas, collectionMetas);
      try {
        writeProfileStorage(
          activeProfileId,
          META_CACHE_KEY,
          JSON.stringify({
            savedAt: new Date().toISOString(),
            metas,
          } satisfies MetaCache),
        );
      } catch {
        // cache write is best-effort (quota etc.)
      }
      return { metas };
    },
    enabled: !!activeProfileId && !!root,
    // The refetch pages the whole collection with full document text (hundreds
    // of docs → tens of MB) and parses them on the main thread — running it on
    // every open (30s stale) is what made 论文库 lag each visit. 5 min keeps
    // freshly interpreted papers picked up quickly while making most opens
    // instant-from-cache (the persisted cache still paints immediately).
    staleTime: 300_000,
    // instant paint from the persisted cache; marked stale so a background
    // refresh still happens
    initialData: () => {
      const cache = readMetaCache(activeProfileId);
      return cache ? { metas: cache.metas } : undefined;
    },
    initialDataUpdatedAt: () => {
      const cache = readMetaCache(activeProfileId);
      return cache ? new Date(cache.savedAt).getTime() : 0;
    },
  });

  return {
    metas: new Map(Object.entries(data?.metas ?? {})),
  };
}

/* ---------- likes & star ratings (shared via the registry doc) ---------- */

export interface PaperInteractionSummary {
  likes: number;
  myLike: boolean;
  scoreAvg: number | null;
  scoreCount: number;
  myScore: number | null;
}

export function summarizeInteractions(
  registry: InteractionData,
  paperId: string,
  myUserId: string | undefined,
): PaperInteractionSummary {
  const users = registry.papers[paperId] ?? {};
  let likes = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  let myLike = false;
  let myScore: number | null = null;
  for (const [uid, e] of Object.entries(users)) {
    if (e.like) likes++;
    if (typeof e.score === "number") {
      scoreSum += e.score;
      scoreCount++;
    }
    if (uid === myUserId) {
      myLike = !!e.like;
      myScore = typeof e.score === "number" ? e.score : null;
    }
  }
  return {
    likes,
    myLike,
    scoreAvg: scoreCount > 0 ? scoreSum / scoreCount : null,
    scoreCount,
    myScore,
  };
}

/**
 * Shared likes / star ratings, stored on WebDAV (坚果云) so the whole team sees
 * the same numbers — no longer an Outline document. The file lives at
 * 论文库/interactions.json under the app-data root.
 *
 * Writes are read-modify-write on the latest server copy, merging ONLY the
 * current user's entry (lab-scale traffic; last-writer-wins acceptable).
 * Consecutive clicks are chained so they can't clobber each other locally;
 * localStorage mirrors the file for instant paint + offline reads.
 */
const PAPER_IX_FILE = "论文库/interactions.json";
const PAPER_IX_CACHE = "papers.interactions.cache.v1";

type IpcResult<T> = { ok: boolean; data?: T; error?: { message: string } };
type DavGet = { found: boolean; content: string | null };

function readPaperIxCache(profileId: string | null): InteractionData {
  try {
    const raw = readProfileStorage(profileId, PAPER_IX_CACHE);
    const d = raw ? (JSON.parse(raw) as InteractionData) : null;
    return d && typeof d.papers === "object" ? d : EMPTY_INTERACTIONS;
  } catch {
    return EMPTY_INTERACTIONS;
  }
}
function writePaperIxCache(profileId: string | null, v: InteractionData): void {
  try {
    writeProfileStorage(profileId, PAPER_IX_CACHE, JSON.stringify(v));
  } catch {
    /* best-effort */
  }
}
function parseInteractions(content: string | null | undefined): InteractionData {
  if (!content) return EMPTY_INTERACTIONS;
  try {
    const d = JSON.parse(content) as InteractionData;
    return d && typeof d.papers === "object" ? d : EMPTY_INTERACTIONS;
  } catch {
    return EMPTY_INTERACTIONS;
  }
}

export function usePaperInteractions(_root: PapersRoot | null): {
  registry: InteractionData;
  summaryFor: (paperId: string) => PaperInteractionSummary;
  toggleLike: (paperId: string) => void;
  setScore: (paperId: string, score: number | null) => void;
  canInteract: boolean;
} {
  void _root;
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const { user } = useUserInfo();
  const [registry, setRegistry] = useState<InteractionData>(() =>
    readPaperIxCache(activeProfileId),
  );
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const loaded = useRef(false);

  useEffect(() => {
    loaded.current = false;
    setRegistry(readPaperIxCache(activeProfileId));
  }, [activeProfileId]);

  useEffect(() => {
    if (loaded.current || !activeProfileId) return;
    loaded.current = true;
    void (async () => {
      const res = (await api.webdav.get(PAPER_IX_FILE)) as IpcResult<DavGet>;
      if (res.ok && res.data?.found) {
        const remote = parseInteractions(res.data.content);
        setRegistry(remote);
        writePaperIxCache(activeProfileId, remote);
      }
    })();
  }, [api, activeProfileId]);

  // optimistic local mutation + read-modify-write to WebDAV
  const commit = (mutate: (cur: InteractionData) => InteractionData) => {
    setRegistry((prev) => {
      const next = mutate(prev);
      writePaperIxCache(activeProfileId, next);
      return next;
    });
    chainRef.current = chainRef.current.then(async () => {
      try {
        const res = (await api.webdav.get(PAPER_IX_FILE)) as IpcResult<DavGet>;
        const latest = res.ok && res.data?.found
          ? parseInteractions(res.data.content)
          : EMPTY_INTERACTIONS;
        const merged = mutate(latest);
        await api.webdav.put(PAPER_IX_FILE, JSON.stringify(merged, null, 2));
        setRegistry(merged);
        writePaperIxCache(activeProfileId, merged);
      } catch (err) {
        console.error("[papers] interaction write failed:", err);
      }
    });
  };

  const summaryFor = (paperId: string) =>
    summarizeInteractions(registry, paperId, user?.id);

  return {
    registry,
    summaryFor,
    toggleLike: (paperId) => {
      if (!user) return;
      const mine = summaryFor(paperId).myLike;
      commit((cur) =>
        mergeEntry(cur, paperId, user.id, user.name ?? "", { like: !mine }),
      );
    },
    setScore: (paperId, score) => {
      if (!user) return;
      commit((cur) =>
        mergeEntry(cur, paperId, user.id, user.name ?? "", { score }),
      );
    },
    canInteract: !!user,
  };
}

function mergeEntry(
  data: InteractionData,
  paperId: string,
  userId: string,
  userName: string,
  patch: { like?: boolean; score?: number | null },
): InteractionData {
  const users = { ...(data.papers[paperId] ?? {}) };
  const prev = users[userId];
  const entry: InteractionEntry = {
    name: userName,
    like: prev?.like,
    score: prev?.score,
    at: new Date().toISOString(),
  };
  if (patch.like !== undefined) entry.like = patch.like || undefined;
  if (patch.score !== undefined) entry.score = patch.score ?? undefined;
  if (!entry.like && entry.score === undefined) {
    delete users[userId];
  } else {
    users[userId] = entry;
  }
  const papers = { ...data.papers };
  if (Object.keys(users).length === 0) delete papers[paperId];
  else papers[paperId] = users;
  return { version: 1, papers };
}

/* ---------- per-paper view counts (background batch fetch + cache) ---------- */

// v2: counts distinct viewers (record count), not total view events.
const VIEWS_CACHE_KEY = "papers.viewsCache.v2";
const VIEWS_REFRESH_MS = 30 * 60_000;

interface ViewsCache {
  savedAt: string;
  views: Record<string, number>;
}

function readViewsCache(profileId: string | null): ViewsCache | null {
  try {
    const raw = readProfileStorage(profileId, VIEWS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as ViewsCache) : null;
  } catch {
    return null;
  }
}

/**
 * Total view counts for all papers. There is no bulk views endpoint, so this
 * walks views.list per paper in small concurrent batches, painting
 * incrementally and persisting to localStorage. A fresh cache (<30 min)
 * skips the sweep entirely.
 */
export function usePaperViews(papers: PaperEntry[]): Map<string, number> {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const [views, setViews] = useState<Record<string, number>>(
    () => readViewsCache(activeProfileId)?.views ?? {},
  );
  const requestedIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!activeProfileId || papers.length === 0) return;
    const cache = readViewsCache(activeProfileId);
    if (
      cache &&
      Date.now() - new Date(cache.savedAt).getTime() < VIEWS_REFRESH_MS
    ) {
      return;
    }
    let cancelled = false;
    const ids = papers.map((p) => p.id).filter((id) => !requestedIdsRef.current.has(id));
    if (ids.length === 0) return;
    ids.forEach((id) => requestedIdsRef.current.add(id));
    const start = () => void (async () => {
      const acc: Record<string, number> = { ...(cache?.views ?? {}) };
      const CONCURRENCY = 8;
      for (let i = 0; i < ids.length; i += CONCURRENCY) {
        if (cancelled) return;
        const batch = ids.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (id) => {
            try {
              const res = await unwrapIpc<{ data: { count?: number }[] }>(
                api.call(activeProfileId, "views.list", { documentId: id }),
              );
              // Distinct viewers: one record per user, so the count is the
              // number of records (not the sum of per-user view events).
              const total = (res.data ?? []).length;
              return [id, total] as const;
            } catch {
              return [id, acc[id] ?? 0] as const;
            }
          }),
        );
        for (const [id, n] of results) acc[id] = n;
        const done = Math.min(i + CONCURRENCY, ids.length);
        if (!cancelled && (done % 40 < CONCURRENCY || done >= ids.length)) {
          setViews({ ...acc });
        }
      }
      try {
        writeProfileStorage(
          activeProfileId,
          VIEWS_CACHE_KEY,
          JSON.stringify({
            savedAt: new Date().toISOString(),
            views: acc,
          } satisfies ViewsCache),
        );
      } catch {
        // best-effort
      }
    })();
    // View counts are supplementary and have no bearing on the first paint.
    // Let the paper rows render before starting one request per paper.
    const idle = window.setTimeout(start, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(idle);
    };
  }, [api, activeProfileId, papers]);

  useEffect(() => {
    requestedIdsRef.current.clear();
    setViews(readViewsCache(activeProfileId)?.views ?? {});
  }, [activeProfileId]);

  return useMemo(() => new Map(Object.entries(views)), [views]);
}

/* ---------- browsing history (my recently-viewed papers) ---------- */

/**
 * The current user's own viewed documents, newest first, as a docId → rank map
 * (0 = most recent). Backed by Outline's `documents.viewed` (server-tracked; the
 * desktop records a view via `views.create` on every open). Callers intersect
 * this with the library set to get "最近浏览的论文".
 */
export function useRecentlyViewedRank(): {
  rank: Map<string, number>;
  isLoading: boolean;
} {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const { data, isLoading } = useQuery({
    queryKey: ["profile", activeProfileId, "documents-viewed"],
    queryFn: async () => {
      const res = await unwrapIpc<{ data: { id: string }[] }>(
        api.call(activeProfileId!, "documents.viewed", { limit: 100 }),
      );
      return res.data ?? [];
    },
    enabled: !!activeProfileId,
    staleTime: 30_000,
  });
  const rank = useMemo(() => {
    const m = new Map<string, number>();
    (data ?? []).forEach((d, i) => m.set(d.id, i));
    return m;
  }, [data]);
  return { rank, isLoading };
}

/* ---------- personal read state ---------- */

export type ReadState = "unread" | "reading" | "read";
const READ_CYCLE: ReadState[] = ["unread", "reading", "read"];

export function useReadStates(): {
  stateFor: (id: string) => ReadState;
  cycle: (id: string) => void;
} {
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const [states, setStates] = useState<Record<string, ReadState>>(() => {
    try {
      return JSON.parse(readProfileStorage(activeProfileId, READ_KEY) ?? "{}") as Record<
        string,
        ReadState
      >;
    } catch {
      return {};
    }
  });

  return {
    stateFor: (id) => states[id] ?? "unread",
    cycle: (id) => {
      const current = states[id] ?? "unread";
      const next =
        READ_CYCLE[(READ_CYCLE.indexOf(current) + 1) % READ_CYCLE.length];
      const merged = { ...states, [id]: next };
      writeProfileStorage(activeProfileId, READ_KEY, JSON.stringify(merged));
      setStates(merged);
    },
  };
}
