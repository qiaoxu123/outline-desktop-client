import { useState } from "react";
import DocPicker from "../notes/DocPicker";
import type { NoteLink } from "../notes/types";
import type { Priority } from "./types";
import type { TodoDraft } from "./useTodos";

const PRIORITIES: { value: Exclude<Priority, null>; label: string }[] = [
  { value: "high", label: "高" },
  { value: "mid", label: "中" },
  { value: "low", label: "低" },
];

export default function TodoComposer({
  initial,
  autoFocus,
  submitLabel = "添加",
  compact,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<TodoDraft>;
  autoFocus?: boolean;
  submitLabel?: string;
  compact?: boolean;
  onSubmit: (draft: TodoDraft) => void;
  onCancel?: () => void;
}): React.ReactElement {
  const [text, setText] = useState(initial?.text ?? "");
  const [dueDate, setDueDate] = useState<string | null>(
    initial?.dueDate ?? null,
  );
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? null);
  const [links, setLinks] = useState<NoteLink[]>(initial?.links ?? []);
  const [picking, setPicking] = useState(false);

  const submit = () => {
    if (!text.trim()) return;
    onSubmit({ text: text.trim(), dueDate, priority, links });
    if (!onCancel) {
      setText("");
      setDueDate(null);
      setPriority(null);
      setLinks([]);
    }
  };

  return (
    <div className={`td-composer${compact ? " compact" : ""}`}>
      <input
        className="td-composer-input"
        autoFocus={autoFocus}
        placeholder="要做什么…（#标签 归类，⌘/Ctrl+Enter 添加）"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape" && onCancel) onCancel();
        }}
      />
      {links.length > 0 && (
        <div className="td-composer-links">
          {links.map((l) => (
            <span className="td-link-chip" key={l.docId}>
              📄 {l.title}
              <button
                onClick={() =>
                  setLinks(links.filter((x) => x.docId !== l.docId))
                }
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="td-composer-bar">
        <input
          type="date"
          className="td-due-input"
          value={dueDate ?? ""}
          onChange={(e) => setDueDate(e.target.value || null)}
          title="截止日期"
        />
        <div className="td-priority-picker">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              className={`td-prio ${p.value}${priority === p.value ? " active" : ""}`}
              title={`优先级 ${p.label}`}
              onClick={() =>
                setPriority(priority === p.value ? null : p.value)
              }
            >
              {p.label}
            </button>
          ))}
        </div>
        <button className="td-link-btn" onClick={() => setPicking(true)}>
          🔗 关联
        </button>
        <span className="td-spacer" />
        {onCancel && (
          <button className="td-btn subtle" onClick={onCancel}>
            取消
          </button>
        )}
        <button
          className="td-btn primary"
          disabled={!text.trim()}
          onClick={submit}
        >
          {submitLabel}
        </button>
      </div>
      {picking && (
        <DocPicker
          existing={links}
          onClose={() => setPicking(false)}
          onPick={(l) =>
            setLinks((prev) =>
              prev.some((x) => x.docId === l.docId) ? prev : [...prev, l],
            )
          }
        />
      )}
    </div>
  );
}
