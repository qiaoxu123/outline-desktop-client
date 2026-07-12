import { useEffect, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useUIStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { unwrapIpc } from "../../lib/ipc";
import type {
  OutlineCollection,
  OutlineCollectionDocument,
  OutlineDocument,
} from "@outline/shared-types";

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
  const [root, setRoot] = useState<PapersRoot | null>(() => {
    try {
      const raw = localStorage.getItem(ROOT_KEY);
      return raw ? (JSON.parse(raw) as PapersRoot) : null;
    } catch {
      return null;
    }
  });
  const [status, setStatus] = useState<"resolving" | "ready" | "error">(
    root ? "ready" : "resolving",
  );

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
        for (const col of cols ?? []) {
          const tree = (
            await unwrapIpc<{ data: OutlineCollectionDocument[] }>(
              api.collections.documents(activeProfileId, col.id),
            )
          ).data;
          const stack = [...(tree ?? [])];
          while (stack.length) {
            const node = stack.pop()!;
            if ((node.title ?? "").trim() === ROOT_TITLE) {
              const hit = { collectionId: col.id, docId: node.id };
              localStorage.setItem(ROOT_KEY, JSON.stringify(hit));
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

export interface PaperEntry {
  id: string;
  title: string;
  emoji: string | null;
  /** From the ancestor folder titles, e.g. 2026 / 7. */
  year: number | null;
  month: number | null;
}

const YEAR_RE = /(\d{4})\s*年/;
const MONTH_RE = /^(\d{1,2})\s*月/;

/** Walk the 推荐阅读 subtree: 年/月 folders are containers, everything else
 * is a paper entry (its own children, if any, are appendices — not papers). */
function collectPapers(
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
    queryFn: () =>
      unwrapIpc<{ data: OutlineCollectionDocument[] }>(
        api.collections.documents(activeProfileId!, root!.collectionId),
      ),
    enabled: !!activeProfileId && !!root,
  });

  const papers: PaperEntry[] = [];
  if (root && data?.data) {
    const stack = [...data.data];
    while (stack.length) {
      const node = stack.pop()!;
      if (node.id === root.docId) {
        collectPapers(node.children ?? [], null, null, papers);
        break;
      }
      stack.push(...(node.children ?? []));
    }
  }
  // Newest recommendation first.
  papers.sort(
    (a, b) => (b.year ?? 0) - (a.year ?? 0) || (b.month ?? 0) - (a.month ?? 0),
  );
  return { papers, isLoading };
}

/* ---------- per-paper metadata from the attribute table ---------- */

export interface PaperMeta {
  tags: string[];
  venue: string | null;
  link: string | null;
  authors: string | null;
  org: string | null;
  parsed: boolean;
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
  return {
    tags: rawTags
      ? rawTags
          .split(/[,，、;；|]/)
          .map((t) => t.replace(/[*_`]/g, "").trim())
          .filter((t) => t.length > 0 && t.length < 40)
      : [],
    venue: pick("发表时间", "发表", "venue"),
    link: linkMatch?.[1] ?? (rawLink && /^https?:/.test(rawLink) ? rawLink : null),
    authors: pick("作者"),
    org: pick("机构"),
    parsed: fields.size > 0,
  };
}

/** Fetch + parse metadata for the given papers (capped; shares the
 * documents.info cache with DocumentView so opening a paper is instant). */
export function usePaperMetas(
  papers: PaperEntry[],
  cap = 60,
): Map<string, PaperMeta> {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const slice = papers.slice(0, cap);

  const queries = useQueries({
    queries: slice.map((p) => ({
      queryKey: ["profile", activeProfileId, "document", p.id],
      queryFn: () =>
        unwrapIpc<{ data: OutlineDocument }>(
          api.documents.info(activeProfileId!, p.id),
        ),
      enabled: !!activeProfileId,
      staleTime: 10 * 60_000,
    })),
  });

  const map = new Map<string, PaperMeta>();
  slice.forEach((p, i) => {
    const text = queries[i]?.data?.data?.text;
    if (typeof text === "string") map.set(p.id, parsePaperMeta(text));
  });
  return map;
}

/* ---------- personal read state ---------- */

export type ReadState = "unread" | "reading" | "read";
const READ_CYCLE: ReadState[] = ["unread", "reading", "read"];

export function useReadStates(): {
  stateFor: (id: string) => ReadState;
  cycle: (id: string) => void;
} {
  const [states, setStates] = useState<Record<string, ReadState>>(() => {
    try {
      return JSON.parse(localStorage.getItem(READ_KEY) ?? "{}") as Record<
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
      localStorage.setItem(READ_KEY, JSON.stringify(merged));
      setStates(merged);
    },
  };
}
