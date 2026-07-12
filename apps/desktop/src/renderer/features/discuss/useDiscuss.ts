import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
    const resolve = async () => {
      try {
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
        if (!cancelled && hit) {
          localStorage.setItem(COLLECTION_ID_KEY, hit.id);
          setCollectionId(hit.id);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    };
    void resolve();
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

/** Comment count + last reply time for one topic (shares the cache entry
 * used by DocumentView's comments panel). */
export function useTopicReplies(documentId: string): {
  count: number;
  lastReplyAt: string | null;
} {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const { data } = useQuery({
    queryKey: ["profile", activeProfileId, "comments", documentId],
    queryFn: () =>
      unwrapIpc<{ data: { createdAt: string }[] }>(
        api.call(activeProfileId!, "comments.list", {
          documentId,
          includeAnchorText: true,
        }),
      ),
    enabled: !!activeProfileId,
    staleTime: 60_000,
  });
  const comments = data?.data ?? [];
  const last = comments.reduce<string | null>(
    (acc, c) => (acc && acc > c.createdAt ? acc : c.createdAt),
    null,
  );
  return { count: comments.length, lastReplyAt: last };
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
