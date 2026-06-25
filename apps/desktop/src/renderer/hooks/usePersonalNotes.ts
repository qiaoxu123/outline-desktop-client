import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "../state/uiStore";
import { useElectronAPI } from "./useElectronAPI";
import { useUserInfo } from "./useOutline";
import { unwrapIpc } from "../lib/ipc";
import type {
  OutlineCollection,
  OutlineCollectionDocument,
} from "@outline/shared-types";

export interface PersonalRoot {
  docId: string;
  collectionId: string;
}

/** The stored pointer to the user's personal-notes folder (null until set). */
export function usePersonalRoot(): {
  root: PersonalRoot | null;
  isLoading: boolean;
} {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);

  const { data, isLoading } = useQuery({
    queryKey: ["profile", activeProfileId, "personalRoot"],
    queryFn: () =>
      unwrapIpc<PersonalRoot | null>(
        api.personalNotes.getRoot(activeProfileId!),
      ),
    enabled: !!activeProfileId,
    staleTime: 5 * 60_000,
  });

  return { root: data ?? null, isLoading };
}

export function useSetPersonalRoot(): {
  setRoot: (root: PersonalRoot) => Promise<void>;
  clear: () => Promise<void>;
} {
  const api = useElectronAPI();
  const queryClient = useQueryClient();
  const activeProfileId = useUIStore((s) => s.activeProfileId);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["profile", activeProfileId, "personalRoot"],
    });

  return {
    setRoot: async (root) => {
      await unwrapIpc(api.personalNotes.setRoot(activeProfileId!, root));
      await invalidate();
    },
    clear: async () => {
      await unwrapIpc(api.personalNotes.clearRoot(activeProfileId!));
      await invalidate();
    },
  };
}

/** Depth-first search for a document node whose title matches `name`. */
function findByTitle(
  nodes: OutlineCollectionDocument[],
  name: string,
): OutlineCollectionDocument | null {
  const exact = name.trim();
  for (const node of nodes) {
    if ((node.title ?? "").trim() === exact) return node;
  }
  // Fall back to a contains-match if no exact title is found at this level.
  for (const node of nodes) {
    if ((node.title ?? "").includes(exact)) return node;
    const child = findByTitle(node.children ?? [], name);
    if (child) return child;
  }
  return null;
}

/**
 * Best-effort auto-detection of the user's personal folder: look for a
 * collection named like "成员笔记", then a document inside it titled with the
 * user's own name (e.g. 博士 / 乔旭 → matches "乔旭"). Returns null if it can't
 * be resolved confidently, in which case the UI offers a manual picker.
 */
export function useAutoDetectRoot(): () => Promise<PersonalRoot | null> {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const { user } = useUserInfo();

  return async () => {
    const name = user?.name?.trim();
    if (!activeProfileId || !name) return null;

    const collections = await unwrapIpc<OutlineCollection[]>(
      api.collections.list(activeProfileId),
    );

    // Search "成员笔记" first, then any other collection as a fallback.
    const ordered = [...collections].sort((a, b) => {
      const am = a.name.includes("成员笔记") ? 0 : 1;
      const bm = b.name.includes("成员笔记") ? 0 : 1;
      return am - bm;
    });

    for (const col of ordered) {
      const tree = await unwrapIpc<OutlineCollectionDocument[]>(
        api.collections.documents(activeProfileId, col.id),
      );
      const hit = findByTitle(tree, name);
      if (hit) return { docId: hit.id, collectionId: col.id };
    }
    return null;
  };
}

/** Create a new note nested under the personal folder; returns its id. */
export function useCreatePersonalNote(): {
  create: (root: PersonalRoot, title?: string) => Promise<string>;
  isPending: boolean;
} {
  const api = useElectronAPI();
  const queryClient = useQueryClient();
  const activeProfileId = useUIStore((s) => s.activeProfileId);

  const mutation = useMutation({
    mutationFn: async ({
      root,
      title,
    }: {
      root: PersonalRoot;
      title?: string;
    }) => {
      const res = await unwrapIpc<{ data: { id: string } }>(
        api.call(activeProfileId!, "documents.create", {
          title: title?.trim() || "新笔记",
          text: "",
          collectionId: root.collectionId,
          parentDocumentId: root.docId,
          publish: true,
        }),
      );
      return res.data.id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["profile", activeProfileId],
      });
    },
  });

  return {
    create: (root, title) => mutation.mutateAsync({ root, title }),
    isPending: mutation.isPending,
  };
}
