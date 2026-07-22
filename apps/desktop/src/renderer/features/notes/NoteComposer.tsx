import { useState } from "react";
import DocPicker from "./DocPicker";
import type { NoteLink } from "./types";

export default function NoteComposer({
  initialContent = "",
  initialLinks = [],
  autoFocus,
  placeholder,
  submitLabel = "保存",
  onSubmit,
  onCancel,
}: {
  initialContent?: string;
  initialLinks?: NoteLink[];
  autoFocus?: boolean;
  placeholder?: string;
  submitLabel?: string;
  onSubmit: (content: string, links: NoteLink[]) => void;
  onCancel?: () => void;
}): React.ReactElement {
  const [content, setContent] = useState(initialContent);
  const [links, setLinks] = useState<NoteLink[]>(initialLinks);
  const [picking, setPicking] = useState(false);

  const submit = () => {
    if (!content.trim()) return;
    onSubmit(content.trim(), links);
    // 顶部速记框（无取消回调）保存后清空，编辑态由父组件卸载
    if (!onCancel) {
      setContent("");
      setLinks([]);
    }
  };

  return (
    <div className="nt-composer">
      <textarea
        className="nt-composer-input"
        autoFocus={autoFocus}
        placeholder={
          placeholder ?? "记点什么…（#标签 归类，⌘/Ctrl+Enter 保存）"
        }
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape" && onCancel) {
            onCancel();
          }
        }}
      />
      {links.length > 0 && (
        <div className="nt-composer-links">
          {links.map((l) => (
            <span className="nt-link-chip" key={l.docId}>
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
      <div className="nt-composer-bar">
        <button className="nt-link-btn" onClick={() => setPicking(true)}>
          🔗 关联文档
        </button>
        <span className="nt-spacer" />
        {onCancel && (
          <button className="nt-btn subtle" onClick={onCancel}>
            取消
          </button>
        )}
        <button
          className="nt-btn primary"
          disabled={!content.trim()}
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

// 正文渲染：#标签 → chip，URL 自动链接，其余按纯文本（保留换行由 CSS white-space 处理）
export function renderContent(
  content: string,
  onTag: (t: string) => void,
): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re =
    /#([^\s#.,;!?，。；！？、）)\]】]+)|(https?:\/\/[^\s]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) parts.push(content.slice(last, m.index));
    if (m[1]) {
      const tag = m[1];
      parts.push(
        <button className="nt-tag" key={i++} onClick={() => onTag(tag)}>
          #{tag}
        </button>,
      );
    } else if (m[2]) {
      parts.push(
        <a
          className="nt-url"
          key={i++}
          href={m[2]}
          target="_blank"
          rel="noreferrer"
        >
          {m[2]}
        </a>,
      );
    }
    last = re.lastIndex;
  }
  if (last < content.length) parts.push(content.slice(last));
  return parts;
}
