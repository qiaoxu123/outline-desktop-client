import { useCallback } from "react";
import { useWebdavStore } from "../../hooks/useWebdavStore";
import { makeId } from "../notes/noteUtils";
import { parseTags } from "../notes/noteUtils";
import {
  type Priority,
  type Todo,
  type TodoLink,
  TODOS_VERSION,
  todosFilePath,
  cacheKey,
} from "./types";
import { toMarkdownExport } from "./todoUtils";

export interface TodoDraft {
  text: string;
  dueDate: string | null;
  priority: Priority;
  links: TodoLink[];
}

export interface UseTodos {
  todos: Todo[];
  liveTodos: Todo[];
  loading: boolean;
  error: unknown;
  userId: string | null;
  add: (draft: TodoDraft) => Promise<void>;
  update: (id: string, draft: TodoDraft) => Promise<void>;
  toggleDone: (id: string) => Promise<void>;
  softDelete: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  hardDelete: (id: string) => Promise<void>;
  bulkDone: (ids: string[], done: boolean) => Promise<void>;
  bulkDelete: (ids: string[]) => Promise<void>;
  clearCompleted: () => Promise<void>;
  exportMarkdown: () => string;
  reload: () => void;
}

export function useTodos(): UseTodos {
  const store = useWebdavStore<Todo>({
    version: TODOS_VERSION,
    itemsKey: "todos",
    filePath: todosFilePath,
    cacheKey,
  });
  const { items: todos, commit } = store;
  const nowIso = () => new Date().toISOString();

  const add = useCallback(
    (d: TodoDraft) =>
      commit((base) => {
        const t = nowIso();
        const todo: Todo = {
          id: makeId(Date.now(), Math.random()),
          text: d.text,
          done: false,
          completedAt: null,
          dueDate: d.dueDate,
          priority: d.priority,
          tags: parseTags(d.text),
          createdAt: t,
          updatedAt: t,
          deletedAt: null,
          links: d.links,
        };
        return [todo, ...base];
      }),
    [commit],
  );

  const update = useCallback(
    (id: string, d: TodoDraft) =>
      commit((base) =>
        base.map((n) =>
          n.id === id
            ? {
                ...n,
                text: d.text,
                dueDate: d.dueDate,
                priority: d.priority,
                links: d.links,
                tags: parseTags(d.text),
                updatedAt: nowIso(),
              }
            : n,
        ),
      ),
    [commit],
  );

  const toggleDone = useCallback(
    (id: string) =>
      commit((base) =>
        base.map((n) => {
          if (n.id !== id) return n;
          const done = !n.done;
          return {
            ...n,
            done,
            completedAt: done ? nowIso() : null,
            updatedAt: nowIso(),
          };
        }),
      ),
    [commit],
  );

  const patch = useCallback(
    (id: string, fields: Partial<Todo>) =>
      commit((base) =>
        base.map((n) =>
          n.id === id ? { ...n, ...fields, updatedAt: nowIso() } : n,
        ),
      ),
    [commit],
  );

  const softDelete = useCallback(
    (id: string) => patch(id, { deletedAt: nowIso() }),
    [patch],
  );
  const restore = useCallback(
    (id: string) => patch(id, { deletedAt: null }),
    [patch],
  );
  const hardDelete = useCallback(
    (id: string) => commit((base) => base.filter((n) => n.id !== id)),
    [commit],
  );

  const bulkDone = useCallback(
    (ids: string[], done: boolean) => {
      const set = new Set(ids);
      const t = nowIso();
      return commit((base) =>
        base.map((n) =>
          set.has(n.id)
            ? { ...n, done, completedAt: done ? t : null, updatedAt: t }
            : n,
        ),
      );
    },
    [commit],
  );
  const bulkDelete = useCallback(
    (ids: string[]) => {
      const set = new Set(ids);
      const t = nowIso();
      return commit((base) =>
        base.map((n) =>
          set.has(n.id) ? { ...n, deletedAt: t, updatedAt: t } : n,
        ),
      );
    },
    [commit],
  );
  const clearCompleted = useCallback(() => {
    const t = nowIso();
    return commit((base) =>
      base.map((n) =>
        n.done && !n.deletedAt ? { ...n, deletedAt: t, updatedAt: t } : n,
      ),
    );
  }, [commit]);

  const exportMarkdown = useCallback(() => toMarkdownExport(todos), [todos]);

  const liveTodos = todos.filter((n) => !n.deletedAt);
  return {
    todos,
    liveTodos,
    loading: store.loading,
    error: store.error,
    userId: store.userId,
    add,
    update,
    toggleDone,
    softDelete,
    restore,
    hardDelete,
    bulkDone,
    bulkDelete,
    clearCompleted,
    exportMarkdown,
    reload: store.reload,
  };
}
