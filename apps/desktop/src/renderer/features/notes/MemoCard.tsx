import { useState } from "react";
import { MarkdownRenderer } from "../../lib/markdown/renderer";
import NoteComposer from "./NoteComposer";
import type { Note, NoteLink } from "./types";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toLocaleDateString();
}

export default function MemoCard({
  note,
  onEdit,
  onDelete,
  onTogglePin,
  onCopy,
  onOpenDoc,
  onToggleTag,
  selectMode,
  selected,
  onToggleSelect,
}: {
  note: Note;
  onEdit: (content: string, links: NoteLink[]) => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onCopy: () => void;
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
      <div className="nt-card editing">
        <NoteComposer
          initialContent={note.content}
          initialLinks={note.links}
          submitLabel="更新"
          autoFocus
          onSubmit={(c, l) => {
            onEdit(c, l);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  // 双击卡片正文直接进入编辑；点在链接/标签/按钮上时不触发。
  const onDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a, button, input")) return;
    setEditing(true);
  };

  return (
    <div
      className={`nt-card${note.pinned ? " pinned" : ""}`}
      onDoubleClick={onDoubleClick}
    >
      {selectMode && (
        <input
          type="checkbox"
          className="nt-card-check"
          checked={selected}
          onChange={onToggleSelect}
        />
      )}
      <div className="nt-card-head">
        <span
          className="nt-card-time"
          title={new Date(note.createdAt).toLocaleString()}
        >
          {note.pinned && "📌 "}
          {timeAgo(note.createdAt)}
        </span>
        <span className="nt-card-actions">
          <button onClick={() => setEditing(true)} title="编辑">
            编辑
          </button>
          <button
            onClick={onTogglePin}
            title={note.pinned ? "取消置顶" : "置顶"}
          >
            {note.pinned ? "取消置顶" : "置顶"}
          </button>
          <button onClick={onCopy} title="复制正文">
            复制
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
      <div className="nt-card-body">
        <MarkdownRenderer content={note.content} breaks onTagClick={onToggleTag} />
      </div>
      {note.links.length > 0 && (
        <div className="nt-card-links">
          {note.links.map((l) => (
            <button
              className="nt-doc-chip"
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
  );
}
