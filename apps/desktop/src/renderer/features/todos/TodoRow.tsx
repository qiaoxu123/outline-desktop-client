import { useState } from "react";
import { renderContent } from "../notes/NoteComposer";
import TodoComposer from "./TodoComposer";
import type { Todo } from "./types";
import type { TodoDraft } from "./useTodos";
import { daysUntil } from "./todoUtils";

function dueLabel(due: string): { text: string; cls: string } {
  const d = daysUntil(due);
  if (d < 0) return { text: `逾期 ${-d} 天`, cls: "overdue" };
  if (d === 0) return { text: "今天", cls: "today" };
  if (d === 1) return { text: "明天", cls: "soon" };
  if (d <= 7) return { text: `${d} 天后`, cls: "soon" };
  return { text: due.slice(5), cls: "later" };
}

const PRIO_LABEL: Record<"high" | "mid" | "low", string> = {
  high: "高",
  mid: "中",
  low: "低",
};

export default function TodoRow({
  todo,
  onToggleDone,
  onEdit,
  onDelete,
  onOpenDoc,
  onToggleTag,
  selectMode,
  selected,
  onToggleSelect,
}: {
  todo: Todo;
  onToggleDone: () => void;
  onEdit: (draft: TodoDraft) => void;
  onDelete: () => void;
  onOpenDoc: (docId: string) => void;
  onToggleTag: (tag: string) => void;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  if (editing) {
    return (
      <div className="td-row editing">
        <TodoComposer
          autoFocus
          submitLabel="更新"
          initial={{
            text: todo.text,
            dueDate: todo.dueDate,
            priority: todo.priority,
            links: todo.links,
          }}
          onSubmit={(d) => {
            onEdit(d);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const due = todo.dueDate ? dueLabel(todo.dueDate) : null;
  return (
    <div className={`td-row${todo.done ? " done" : ""}`}>
      {selectMode ? (
        <input
          type="checkbox"
          className="td-select"
          checked={selected}
          onChange={onToggleSelect}
        />
      ) : (
        <button
          className={`td-check${todo.done ? " checked" : ""}`}
          onClick={onToggleDone}
          title={todo.done ? "标记未完成" : "标记完成"}
          aria-label="完成"
        >
          {todo.done ? "✓" : ""}
        </button>
      )}
      {todo.priority && (
        <span
          className={`td-prio-dot ${todo.priority}`}
          title={`优先级 ${PRIO_LABEL[todo.priority]}`}
        />
      )}
      <div className="td-main">
        <div className="td-text">{renderContent(todo.text, onToggleTag)}</div>
        {todo.links.length > 0 && (
          <div className="td-links">
            {todo.links.map((l) => (
              <button
                className="td-doc-chip"
                key={l.docId}
                onClick={() => onOpenDoc(l.docId)}
                title={`打开：${l.title}`}
              >
                📄 {l.title}
              </button>
            ))}
          </div>
        )}
      </div>
      {due && <span className={`td-due-chip ${due.cls}`}>{due.text}</span>}
      <span className="td-row-actions">
        <button onClick={() => setEditing(true)} title="编辑">
          编辑
        </button>
        <button
          className={confirmDel ? "danger" : ""}
          onClick={() => {
            if (confirmDel) onDelete();
            else setConfirmDel(true);
          }}
          onMouseLeave={() => setConfirmDel(false)}
        >
          {confirmDel ? "确认删除？" : "删除"}
        </button>
      </span>
    </div>
  );
}
