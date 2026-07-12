import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import { useElectronAPI } from "../../hooks/useElectronAPI";

interface ForumTopic {
  id: number;
  title: string;
  bumpedAt: string;
}

/**
 * "Last seen" watermark for the forum unread badge. First run starts at
 * install time (no retroactive badge storm); entering the forum bumps it.
 */
interface ForumSeenState {
  lastSeen: string;
  markSeen: () => void;
}

function initialLastSeen(): string {
  const stored = localStorage.getItem("forum.lastSeen");
  if (stored) return stored;
  const now = new Date().toISOString();
  localStorage.setItem("forum.lastSeen", now);
  return now;
}

export const useForumSeenStore = create<ForumSeenState>((set) => ({
  lastSeen: initialLastSeen(),
  markSeen: () => {
    const now = new Date().toISOString();
    localStorage.setItem("forum.lastSeen", now);
    set({ lastSeen: now });
  },
}));

/** Topics bumped since the user last opened the forum (0 when logged out /
 * unreachable — the badge simply stays hidden). Polls every 5 minutes. */
export function useForumUnreadCount(): number {
  const api = useElectronAPI();
  const lastSeen = useForumSeenStore((s) => s.lastSeen);

  const { data } = useQuery({
    queryKey: ["forum", "latest"],
    queryFn: () =>
      api.forumLatest() as Promise<{ ok: boolean; data?: ForumTopic[] }>,
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
    retry: false,
  });

  if (!data?.ok || !data.data) return 0;
  return data.data.filter((t) => t.bumpedAt > lastSeen).length;
}
