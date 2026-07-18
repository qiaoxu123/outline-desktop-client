import { useMemo } from "react";
import {
  usePaperEntries,
  usePaperMetas,
  type PapersRoot,
} from "./usePapers";

/**
 * 论文关系图 data: nodes = papers in the library, links = in-body doc links
 * (`/doc/<slug>`) between two papers, treated as undirected and dedup'd.
 * Reuses usePaperEntries / usePaperMetas — no extra network traffic.
 */

export interface GraphNode {
  /** Outline document id. */
  id: string;
  /** Library title with the leading 📖 stripped. */
  title: string;
  topic: string | null;
  /** Number of (undirected) links touching this node. */
  degree: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export function usePaperGraph(root: PapersRoot | null): {
  nodes: GraphNode[];
  links: GraphLink[];
  isLoading: boolean;
} {
  const { papers, isLoading } = usePaperEntries(root);
  const { metas } = usePaperMetas(root);

  const { nodes, links } = useMemo(() => {
    // dedupe defensively — a paper could be collected from two subtrees
    const uniquePapers = [...new Map(papers.map((p) => [p.id, p])).values()];
    const nodeSet = new Set(uniquePapers.map((p) => p.id));

    // urlId → docId (metas are keyed by docId)
    const byUrlId = new Map<string, string>();
    for (const [docId, meta] of metas) {
      if (meta.urlId) byUrlId.set(meta.urlId, docId);
    }

    // undirected edges, dedup'd via a sorted-pair key
    const edgeKeys = new Set<string>();
    const links: GraphLink[] = [];
    const degree = new Map<string, number>();
    for (const p of uniquePapers) {
      for (const urlId of metas.get(p.id)?.outLinks ?? []) {
        const target = byUrlId.get(urlId);
        if (!target || target === p.id || !nodeSet.has(target)) continue;
        const key = p.id < target ? `${p.id}|${target}` : `${target}|${p.id}`;
        if (edgeKeys.has(key)) continue;
        edgeKeys.add(key);
        links.push({ source: p.id, target });
        degree.set(p.id, (degree.get(p.id) ?? 0) + 1);
        degree.set(target, (degree.get(target) ?? 0) + 1);
      }
    }

    const nodes: GraphNode[] = uniquePapers.map((p) => ({
      id: p.id,
      title: p.title.replace(/^📖\s*/, ""),
      topic: p.topic ?? null,
      degree: degree.get(p.id) ?? 0,
    }));

    return { nodes, links };
  }, [papers, metas]);

  return { nodes, links, isLoading };
}
