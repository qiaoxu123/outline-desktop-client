import { useLayoutEffect, useRef, useState } from "react";
import { OIcon } from "../../components/outlineIcons";
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
  const taRef = useRef<HTMLTextAreaElement>(null);

  // 自适应高度：随内容撑高（空时保持 CSS min-height），最高 60vh，超出才内部滚动。
  // 编辑长笔记时能展开看全，而不是挤在固定的小框里滚动。
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const max = Math.round(window.innerHeight * 0.6);
    ta.style.height = `${Math.min(ta.scrollHeight, max)}px`;
  }, [content]);

  const submit = () => {
    if (!content.trim()) return;
    onSubmit(content.trim(), links);
    // 顶部速记框（无取消回调）保存后清空，编辑态由父组件卸载
    if (!onCancel) {
      setContent("");
      setLinks([]);
    }
  };

  // 在光标处插入文本并保持焦点（工具栏 # 使用）
  const insertAtCursor = (text: string) => {
    const ta = taRef.current;
    if (!ta) {
      setContent((c) => c + text);
      return;
    }
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const next = content.slice(0, s) + text + content.slice(e);
    setContent(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = s + text.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="nt-composer">
      <textarea
        ref={taRef}
        className="nt-composer-input"
        autoFocus={autoFocus}
        placeholder={placeholder ?? "现在的想法是…"}
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
        <div className="nt-toolbar">
          <button
            type="button"
            className="nt-tool"
            title="插入标签"
            onClick={() => insertAtCursor("#")}
          >
            <OIcon name="tag" size={18} />
          </button>
          <button
            type="button"
            className="nt-tool"
            title="插图（即将支持）"
            disabled
          >
            <ImageGlyph />
          </button>
          <span className="nt-tool-sep" />
          <button
            type="button"
            className="nt-tool nt-tool-text"
            title="字体样式（即将支持）"
            disabled
          >
            Aa
          </button>
          <button
            type="button"
            className="nt-tool"
            title="无序列表（即将支持）"
            disabled
          >
            <OIcon name="bulletList" size={18} />
          </button>
          <button
            type="button"
            className="nt-tool"
            title="有序列表（即将支持）"
            disabled
          >
            <OIcon name="orderedList" size={18} />
          </button>
          <span className="nt-tool-sep" />
          <button
            type="button"
            className="nt-tool nt-tool-text"
            title="关联文档"
            onClick={() => setPicking(true)}
          >
            @
          </button>
        </div>
        <span className="nt-spacer" />
        {onCancel ? (
          <>
            <button className="nt-btn subtle" onClick={onCancel}>
              取消
            </button>
            <button
              className="nt-btn primary"
              disabled={!content.trim()}
              onClick={submit}
            >
              {submitLabel}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="nt-send"
            title="保存（⌘/Ctrl+Enter）"
            disabled={!content.trim()}
            onClick={submit}
          >
            <SendGlyph />
          </button>
        )}
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

// 工具栏「插图」占位图标（OIcon 无图片图标，内联一个）
function ImageGlyph(): React.ReactElement {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <rect
        x={4}
        y={5}
        width={16}
        height={14}
        rx={2}
        stroke="currentColor"
        strokeWidth={1.6}
      />
      <circle cx={9} cy={10} r={1.6} fill="currentColor" />
      <path
        d="M5 17l4.5-4.5 3 3L16 12l3 3.5"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// 发送按钮图标（纸飞机箭头）
function SendGlyph(): React.ReactElement {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <path
        d="M5 12h13M12 5l7 7-7 7"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// 单行内联渲染：#标签 → 可点击 chip，URL 自动链接。用于待办等紧凑单行文本
// （随记卡片改用 MarkdownRenderer 做完整 markdown 渲染，不走此函数）。
export function renderContent(
  content: string,
  onTag: (t: string) => void,
): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /#([^\s#.,;!?，。；！？、）)\]】]+)|(https?:\/\/[^\s]+)/g;
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
