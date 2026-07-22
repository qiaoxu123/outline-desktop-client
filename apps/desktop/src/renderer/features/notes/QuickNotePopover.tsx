import { useNotes } from "./useNotes";
import NoteComposer from "./NoteComposer";
import type { NoteLink } from "./types";
import "./NotesView.css";

/**
 * Compact quick-capture popover launched from the document view; pre-links
 * the current document so reading-time notes carry their source. Mounts
 * `useNotes` only while open, so it hits WebDAV only when actually used.
 */
export default function QuickNotePopover({
  link,
  onClose,
}: {
  link: NoteLink;
  onClose: () => void;
}): React.ReactElement {
  const { add } = useNotes();
  return (
    <div className="nt-quick-popover-backdrop" onClick={onClose}>
      <div className="nt-quick-popover" onClick={(e) => e.stopPropagation()}>
        <div className="nt-quick-popover-head">＋ 随记 · 关联「{link.title}」</div>
        <NoteComposer
          autoFocus
          initialLinks={[link]}
          submitLabel="记下"
          placeholder="读到什么记一笔…（#标签 归类，⌘/Ctrl+Enter 保存）"
          onSubmit={(c, l) => {
            void add(c, l);
            onClose();
          }}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}
