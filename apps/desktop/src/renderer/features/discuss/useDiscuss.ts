import { useCallback, useEffect, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { unwrapIpc } from "../../lib/ipc";
import type { OutlineCollection } from "@outline/shared-types";

const COLLECTION_NAME = "讨论区";
const COLLECTION_ID_KEY = "discuss.collectionId";
const SEEN_KEY = "discuss.seen";

/** The forum collection id, once resolved (also read by DocumentView to
 * auto-open the comments panel for forum topics). */
export function discussCollectionId(): string | null {
  return localStorage.getItem(COLLECTION_ID_KEY);
}

/**
 * Resolve the 讨论区 collection: find it by name, create it if missing
 * (team read_write so everyone can post), and remember its id.
 */
// Module-level in-flight guard: React StrictMode double-runs effects, and two
// concurrent resolves once raced to CREATE the collection twice.
let resolveInFlight: Promise<string | null> | null = null;

export function useDiscussCollection(): {
  collectionId: string | null;
  status: "resolving" | "ready" | "error";
} {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const [collectionId, setCollectionId] = useState<string | null>(
    discussCollectionId,
  );
  const [status, setStatus] = useState<"resolving" | "ready" | "error">(
    collectionId ? "ready" : "resolving",
  );

  useEffect(() => {
    if (collectionId || !activeProfileId) return;
    let cancelled = false;

    const doResolve = async (): Promise<string | null> => {
      const list = await unwrapIpc<{ data: OutlineCollection[] }>(
        api.collections.list(activeProfileId),
      );
      // collections.list unwraps to an array on some IPC paths — normalize.
      const collections = Array.isArray(list)
        ? (list as unknown as OutlineCollection[])
        : (list.data ?? []);
      let hit = collections.find((c) => c.name === COLLECTION_NAME);
      if (!hit) {
        const created = await unwrapIpc<{ data: OutlineCollection }>(
          api.call(activeProfileId, "collections.create", {
            name: COLLECTION_NAME,
            description:
              "组内交流板块 — 由 Outline Desktop 创建,主题即文档,回复即评论。",
            permission: "read_write",
            color: "#FF825C",
          }),
        );
        hit = created.data;
      }
      if (hit) localStorage.setItem(COLLECTION_ID_KEY, hit.id);
      return hit?.id ?? null;
    };

    resolveInFlight ??= doResolve();
    resolveInFlight
      .then((id) => {
        if (!cancelled && id) {
          setCollectionId(id);
          setStatus("ready");
        }
      })
      .catch(() => {
        resolveInFlight = null; // allow a retry on next mount
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [api, activeProfileId, collectionId]);

  return { collectionId, status };
}

export interface Topic {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; name: string; avatarUrl?: string | null };
}

export function useTopics(collectionId: string | null): {
  topics: Topic[];
  isLoading: boolean;
  error: unknown;
} {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", activeProfileId, "discuss", collectionId],
    queryFn: () =>
      unwrapIpc<{ data: Topic[] }>(
        api.call(activeProfileId!, "documents.list", {
          collectionId,
          parentDocumentId: null,
          sort: "updatedAt",
          direction: "DESC",
          limit: 50,
        }),
      ),
    enabled: !!activeProfileId && !!collectionId,
    refetchInterval: 2 * 60_000,
  });
  return { topics: data?.data ?? [], isLoading, error };
}

export interface TopicWithActivity {
  topic: Topic;
  replyCount: number;
  /** max(doc updatedAt, latest reply createdAt) — the forum sort key. */
  lastActivity: string;
}

/**
 * Topics enriched with reply data and sorted by real last activity: replies
 * don't bump a document's updatedAt server-side, so the reply queries (same
 * cache entries the comments panel uses) are lifted here and the list is
 * sorted client-side.
 */
export function useTopicsWithActivity(collectionId: string | null): {
  rows: TopicWithActivity[];
  isLoading: boolean;
  error: unknown;
} {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const { topics, isLoading, error } = useTopics(collectionId);

  const replyQueries = useQueries({
    queries: topics.map((t) => ({
      queryKey: ["profile", activeProfileId, "comments", t.id],
      queryFn: () =>
        unwrapIpc<{ data: { createdAt: string }[] }>(
          api.call(activeProfileId!, "comments.list", {
            documentId: t.id,
            includeAnchorText: true,
          }),
        ),
      enabled: !!activeProfileId,
      staleTime: 60_000,
    })),
  });

  const rows: TopicWithActivity[] = topics.map((topic, i) => {
    const comments = replyQueries[i]?.data?.data ?? [];
    const lastReply = comments.reduce<string | null>(
      (acc, c) => (acc && acc > c.createdAt ? acc : c.createdAt),
      null,
    );
    return {
      topic,
      replyCount: comments.length,
      lastActivity:
        lastReply && lastReply > topic.updatedAt ? lastReply : topic.updatedAt,
    };
  });
  rows.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));

  return { rows, isLoading, error };
}

/**
 * Sidebar badge: number of topics *created* since the board was last opened.
 * (Deliberately new-topics-only — computing reply-based unread here would
 * fire 50 comment queries at app start; the in-list dots cover replies.)
 */
const VISIT_KEY = "discuss.lastVisit";

export function useDiscussNewTopicCount(): number {
  const { topics } = useTopics(discussCollectionId());
  const [lastVisit, setLastVisit] = useState(
    () => localStorage.getItem(VISIT_KEY) ?? new Date().toISOString(),
  );

  // Initialize the watermark on first run so the badge starts quiet.
  useEffect(() => {
    if (!localStorage.getItem(VISIT_KEY)) {
      localStorage.setItem(VISIT_KEY, lastVisit);
    }
    const onVisit = () => setLastVisit(localStorage.getItem(VISIT_KEY) ?? lastVisit);
    window.addEventListener("discuss-visited", onVisit);
    return () => window.removeEventListener("discuss-visited", onVisit);
  }, [lastVisit]);

  return topics.filter((t) => t.createdAt > lastVisit).length;
}

export function markDiscussVisited(): void {
  localStorage.setItem(VISIT_KEY, new Date().toISOString());
  window.dispatchEvent(new Event("discuss-visited"));
}

/* per-topic read watermarks */

function readSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as Record<
      string,
      string
    >;
  } catch {
    return {};
  }
}

export function useTopicSeen(): {
  isUnread: (topicId: string, lastActivity: string) => boolean;
  markSeen: (topicId: string) => void;
} {
  const queryClient = useQueryClient();
  const [seen, setSeen] = useState<Record<string, string>>(readSeen);

  const isUnread = useCallback(
    (topicId: string, lastActivity: string) => {
      const at = seen[topicId];
      return !at || lastActivity > at;
    },
    [seen],
  );

  const markSeen = useCallback(
    (topicId: string) => {
      const next = { ...seen, [topicId]: new Date().toISOString() };
      localStorage.setItem(SEEN_KEY, JSON.stringify(next));
      setSeen(next);
      void queryClient; // keep hook signature future-proof
    },
    [seen, queryClient],
  );

  return { isUnread, markSeen };
}
