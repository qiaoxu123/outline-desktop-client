import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "../state/uiStore";
import { useElectronAPI } from "./useElectronAPI";
import { unwrapIpc } from "../lib/ipc";

export const SERVER_URL = "https://notes.jlu-mcns.site";

/* ---------- auth.info: current user + team ---------- */

export interface OutlineUser {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
  role?: string;
  isAdmin?: boolean;
  isViewer?: boolean;
  createdAt?: string;
}

export interface OutlineTeam {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

interface AuthInfoResponse {
  data: { user?: OutlineUser; team?: OutlineTeam };
}

export function useUserInfo(): {
  user: OutlineUser | undefined;
  team: OutlineTeam | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);

  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", activeProfileId, "userInfo"],
    queryFn: () =>
      unwrapIpc<AuthInfoResponse>(api.call(activeProfileId!, "auth.info")),
    enabled: !!activeProfileId,
    staleTime: 5 * 60_000,
  });

  return {
    user: data?.data?.user,
    team: data?.data?.team,
    isLoading,
    error,
  };
}

/** Viewers/guests cannot edit; admins and members can. */
export function canUserEdit(user: OutlineUser | undefined): boolean {
  if (!user) return false;
  if (user.isViewer) return false;
  const role = (user.role ?? "").toLowerCase();
  return role !== "viewer" && role !== "guest";
}

/** Avatar URLs may be server-relative — make them absolute. */
export function absoluteUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  return SERVER_URL + (url.startsWith("/") ? url : `/${url}`);
}

export function roleLabel(user: OutlineUser | undefined): string {
  const role = (user?.role ?? "").toLowerCase();
  if (user?.isAdmin || role === "admin") return "管理员";
  if (role === "viewer") return "只读成员";
  if (role === "guest") return "访客";
  if (role === "member") return "成员";
  return role || "成员";
}

/* ---------- stars ---------- */

export interface OutlineStar {
  id: string;
  documentId?: string | null;
  collectionId?: string | null;
}

export interface StarredDoc {
  starId: string;
  documentId: string;
  title: string;
  emoji?: string | null;
}

interface StarsListResponse {
  data: {
    stars?: OutlineStar[];
    documents?: { id: string; title: string; emoji?: string | null }[];
  };
}

export function useStars(): {
  starred: StarredDoc[];
  starFor: (documentId: string) => StarredDoc | undefined;
  isLoading: boolean;
} {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);

  const { data, isLoading } = useQuery({
    queryKey: ["profile", activeProfileId, "stars"],
    queryFn: () =>
      unwrapIpc<StarsListResponse>(api.call(activeProfileId!, "stars.list")),
    enabled: !!activeProfileId,
  });

  const stars = data?.data?.stars ?? [];
  const documents = data?.data?.documents ?? [];
  const docById = new Map(documents.map((d) => [d.id, d]));

  const starred: StarredDoc[] = stars
    .filter((s) => !!s.documentId)
    .map((s) => {
      const doc = docById.get(s.documentId!);
      return {
        starId: s.id,
        documentId: s.documentId!,
        title: doc?.title ?? "Untitled",
        emoji: doc?.emoji,
      };
    });

  return {
    starred,
    starFor: (documentId) => starred.find((s) => s.documentId === documentId),
    isLoading,
  };
}

export function useToggleStar(): {
  toggle: (documentId: string, existing?: StarredDoc) => void;
  isPending: boolean;
} {
  const api = useElectronAPI();
  const queryClient = useQueryClient();
  const activeProfileId = useUIStore((s) => s.activeProfileId);

  const mutation = useMutation({
    mutationFn: async ({
      documentId,
      existing,
    }: {
      documentId: string;
      existing?: StarredDoc;
    }) => {
      if (existing) {
        await unwrapIpc(
          api.call(activeProfileId!, "stars.delete", { id: existing.starId }),
        );
      } else {
        await unwrapIpc(
          api.call(activeProfileId!, "stars.create", { documentId }),
        );
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ["profile", activeProfileId, "stars"],
      });
    },
  });

  return {
    toggle: (documentId, existing) =>
      mutation.mutate({ documentId, existing }),
    isPending: mutation.isPending,
  };
}
