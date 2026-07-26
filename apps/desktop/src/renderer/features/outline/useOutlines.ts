import { useCallback } from "react";
import { useWebdavStore } from "../../hooks/useWebdavStore";
import {
  type OutlineDoc,
  type OutlineNode,
  OUTLINE_VERSION,
  outlineFilePath,
  outlineCacheKey,
  makeNodeId,
  emptyNode,
} from "./types";

export interface UseOutlines {
  outlines: OutlineDoc[];
  loading: boolean;
  error: unknown;
  userId: string | null;
  addDoc: (title: string) => Promise<string>;
  renameDoc: (id: string, title: string) => Promise<void>;
  removeDoc: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  updateNodes: (docId: string, mutate: (root: OutlineNode[]) => OutlineNode[]) => Promise<void>;
  reload: () => void;
}

export function useOutlines(): UseOutlines {
  const store = useWebdavStore<OutlineDoc>({
    version: OUTLINE_VERSION,
    itemsKey: "outlines",
    filePath: outlineFilePath,
    cacheKey: outlineCacheKey,
  });
  const { commit } = store;
  const nowIso = () => new Date().toISOString();

  const addDoc = useCallback(
    async (title: string): Promise<string> => {
      const id = makeNodeId(Date.now(), Math.random());
      const t = nowIso();
      const doc: OutlineDoc = {
        id,
        title: title || "未命名大纲",
        root: [emptyNode(makeNodeId(Date.now(), Math.random()))],
        createdAt: t,
        updatedAt: t,
        deletedAt: null,
      };
      await commit((base) => [doc, ...base]);
      return id;
    },
    [commit],
  );

  const patchDoc = useCallback(
    (id: string, fields: Partial<OutlineDoc>) =>
      commit((base) =>
        base.map((d) => (d.id === id ? { ...d, ...fields, updatedAt: nowIso() } : d)),
      ),
    [commit],
  );

  const renameDoc = useCallback((id: string, title: string) => patchDoc(id, { title }), [patchDoc]);
  const removeDoc = useCallback((id: string) => patchDoc(id, { deletedAt: nowIso() }), [patchDoc]);
  const togglePin = useCallback(
    (id: string) =>
      commit((base) =>
        base.map((d) =>
          d.id === id ? { ...d, pinned: !d.pinned, updatedAt: nowIso() } : d,
        ),
      ),
    [commit],
  );

  const updateNodes = useCallback(
    (docId: string, mutate: (root: OutlineNode[]) => OutlineNode[]) =>
      commit((base) =>
        base.map((d) =>
          d.id === docId ? { ...d, root: mutate(d.root), updatedAt: nowIso() } : d,
        ),
      ),
    [commit],
  );

  const outlines = store.items
    .filter((d) => !d.deletedAt)
    .sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  return {
    outlines,
    loading: store.loading,
    error: store.error,
    userId: store.userId,
    addDoc,
    renameDoc,
    removeDoc,
    togglePin,
    updateNodes,
    reload: store.reload,
  };
}
