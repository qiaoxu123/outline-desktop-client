import { useCallback } from "react";
import { useWebdavStore } from "../../hooks/useWebdavStore";
import {
  type Page,
  type Block,
  OUTLINE_VERSION,
  outlineFilePath,
  outlineCacheKey,
  makeBlockId,
  emptyBlock,
} from "./types";

export interface UsePages {
  pages: Page[];
  loading: boolean;
  error: unknown;
  userId: string | null;
  addPage: (title: string) => Promise<string>;
  renamePage: (id: string, title: string) => Promise<void>;
  removePage: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  updateBlocks: (pageId: string, mutate: (root: Block[]) => Block[]) => Promise<void>;
  reload: () => void;
}

export function usePages(): UsePages {
  const store = useWebdavStore<Page>({
    version: OUTLINE_VERSION,
    itemsKey: "pages",
    filePath: outlineFilePath,
    cacheKey: outlineCacheKey,
  });
  const { commit } = store;
  const nowIso = () => new Date().toISOString();

  const addPage = useCallback(
    async (title: string): Promise<string> => {
      const id = makeBlockId(Date.now(), Math.random());
      const t = nowIso();
      const page: Page = {
        id,
        title: title || "未命名大纲",
        root: [emptyBlock(makeBlockId(Date.now(), Math.random()))],
        createdAt: t,
        updatedAt: t,
        deletedAt: null,
      };
      await commit((base) => [page, ...base]);
      return id;
    },
    [commit],
  );

  const patchPage = useCallback(
    (id: string, fields: Partial<Page>) =>
      commit((base) =>
        base.map((p) => (p.id === id ? { ...p, ...fields, updatedAt: nowIso() } : p)),
      ),
    [commit],
  );

  const renamePage = useCallback((id: string, title: string) => patchPage(id, { title }), [patchPage]);
  const removePage = useCallback((id: string) => patchPage(id, { deletedAt: nowIso() }), [patchPage]);
  const togglePin = useCallback(
    (id: string) =>
      commit((base) =>
        base.map((p) =>
          p.id === id ? { ...p, pinned: !p.pinned, updatedAt: nowIso() } : p,
        ),
      ),
    [commit],
  );

  const updateBlocks = useCallback(
    (pageId: string, mutate: (root: Block[]) => Block[]) =>
      commit((base) =>
        base.map((p) =>
          p.id === pageId ? { ...p, root: mutate(p.root), updatedAt: nowIso() } : p,
        ),
      ),
    [commit],
  );

  const pages = store.items
    .filter((p) => !p.deletedAt)
    .sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  return {
    pages,
    loading: store.loading,
    error: store.error,
    userId: store.userId,
    addPage,
    renamePage,
    removePage,
    togglePin,
    updateBlocks,
    reload: store.reload,
  };
}
