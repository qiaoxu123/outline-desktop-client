export const TODOS_VERSION = 1;

export type Priority = "high" | "mid" | "low" | null;

export interface TodoLink {
  docId: string;
  urlId?: string;
  title: string;
}

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  completedAt: string | null;
  dueDate: string | null; // YYYY-MM-DD, local day
  priority: Priority;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  links: TodoLink[];
}

/** Per-user private file under the shared WebDAV root (5-共享/Outline桌面端). */
export function todosFilePath(userId: string): string {
  return `待办/${userId}.json`;
}

export function cacheKey(userId: string): string {
  return `todos.cache.${userId}.v1`;
}
