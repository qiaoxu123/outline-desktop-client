import { useTodos } from "./useTodos";
import TodoComposer from "./TodoComposer";
import type { NoteLink } from "../notes/types";
import "./TodosView.css";

/**
 * Compact quick-add popover launched from the document view; pre-links the
 * current document. Mounts `useTodos` only while open.
 */
export default function QuickTodoPopover({
  link,
  onClose,
}: {
  link: NoteLink;
  onClose: () => void;
}): React.ReactElement {
  const { add } = useTodos();
  return (
    <div className="td-quick-popover-backdrop" onClick={onClose}>
      <div className="td-quick-popover" onClick={(e) => e.stopPropagation()}>
        <div className="td-quick-popover-head">
          ＋ 待办 · 关联「{link.title}」
        </div>
        <TodoComposer
          autoFocus
          compact
          submitLabel="添加"
          initial={{ links: [link] }}
          onSubmit={(d) => {
            void add(d);
            onClose();
          }}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}
