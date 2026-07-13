import { useMemo, useRef, useState } from "react";
import { MarkdownRenderer } from "../../lib/markdown/renderer";
import { useUserInfo, roleLabel } from "../../hooks/useOutline";
import { useQuiz, type Card, type Grade } from "./useQuiz";
import { useCardInteractions } from "./useCardInteractions";
import { QUIZ_CATEGORIES } from "./quizData";
import "./QuizView.css";

type Interactions = ReturnType<typeof useCardInteractions>;

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ---------- per-card likes + comments (shared) ---------- */

function CardInteractionBar({
  cardId,
  ix,
}: {
  cardId: string;
  ix: Interactions;
}): React.ReactElement {
  const s = ix.summaryFor(cardId);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  return (
    <div className="quiz-ix">
      <div className="quiz-ix-actions">
        <button
          className={`quiz-ix-like ${s.likedByMe ? "liked" : ""}`}
          onClick={() => ix.toggleLike(cardId)}
          title={s.likers.length ? `赞：${s.likers.join("、")}` : "点赞"}
        >
          👍{s.likeCount > 0 ? ` ${s.likeCount}` : ""}
        </button>
        <button
          className={`quiz-ix-comment-btn ${open ? "active" : ""}`}
          onClick={() => setOpen((v) => !v)}
        >
          💬 评论{s.comments.length > 0 ? ` ${s.comments.length}` : ""}
        </button>
      </div>

      {open && (
        <div className="quiz-ix-comments">
          {s.comments.map((c) => (
            <div key={c.id} className="quiz-ix-comment">
              <div className="quiz-ix-comment-head">
                <b>{c.name}</b>
                <span className="quiz-ix-comment-time">
                  {fmtTime(c.at)}
                  {c.editedAt ? "（已编辑）" : ""}
                </span>
              </div>
              {editingId === c.id ? (
                <div className="quiz-ix-edit">
                  <textarea
                    className="quiz-input"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    autoFocus
                  />
                  <div className="quiz-ix-edit-actions">
                    <button
                      className="quiz-btn ghost sm"
                      onClick={() => setEditingId(null)}
                    >
                      取消
                    </button>
                    <button
                      className="quiz-btn primary sm"
                      disabled={!editText.trim()}
                      onClick={() => {
                        ix.editComment(cardId, c.id, editText);
                        setEditingId(null);
                      }}
                    >
                      保存
                    </button>
                  </div>
                </div>
              ) : (
                <div className="quiz-ix-comment-text">{c.text}</div>
              )}
              {ix.me?.id === c.userId && editingId !== c.id && (
                <div className="quiz-ix-comment-tools">
                  <button
                    className="quiz-btn ghost sm"
                    onClick={() => {
                      setEditingId(c.id);
                      setEditText(c.text);
                    }}
                  >
                    编辑
                  </button>
                  <button
                    className="quiz-btn ghost sm danger"
                    onClick={() => {
                      if (confirm("删除这条评论？")) ix.deleteComment(cardId, c.id);
                    }}
                  >
                    删除
                  </button>
                </div>
              )}
            </div>
          ))}
          {s.comments.length === 0 && (
            <p className="quiz-ix-empty">还没有评论，来写第一条。</p>
          )}
          <div className="quiz-ix-add">
            <textarea
              className="quiz-input"
              placeholder="写评论…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button
              className="quiz-btn primary sm"
              disabled={!draft.trim()}
              onClick={() => {
                ix.addComment(cardId, draft);
                setDraft("");
              }}
            >
              发表
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  new: "未学",
  due: "待复习",
  done: "已掌握",
};

const GRADE_BUTTONS: { grade: Grade; label: string; hint: string }[] = [
  { grade: "again", label: "重来", hint: "没答上，今天再来" },
  { grade: "hard", label: "困难", hint: "答得吃力" },
  { grade: "good", label: "良好", hint: "答对了" },
  { grade: "easy", label: "简单", hint: "很轻松，拉长间隔" },
];

/* ---------- review mode (Anki-style flip card) ---------- */

function ReviewMode({
  queue,
  ix,
  onGrade,
  onExit,
}: {
  queue: Card[];
  ix: Interactions;
  onGrade: (id: string, g: Grade) => void;
  onExit: () => void;
}): React.ReactElement {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const total = queue.length;
  const card = queue[index];

  if (!card) {
    return (
      <div className="quiz-review-done">
        <div className="quiz-done-check">✓</div>
        <h3>本轮复习完成</h3>
        <p>共复习 {total} 张卡片。</p>
        <button className="quiz-btn primary" onClick={onExit}>
          返回题库
        </button>
      </div>
    );
  }

  const handleGrade = (g: Grade) => {
    onGrade(card.id, g);
    setRevealed(false);
    setIndex((i) => i + 1);
  };

  return (
    <div className="quiz-review">
      <div className="quiz-review-top">
        <button className="quiz-btn ghost" onClick={onExit}>
          ← 退出复习
        </button>
        <span className="quiz-review-progress">
          {index + 1} / {total}
        </span>
      </div>

      <div className="quiz-card">
        <div className="quiz-card-cat">{card.category}</div>
        <div className="quiz-card-question">{card.question}</div>

        {revealed ? (
          <div className="quiz-card-answer markdown-body">
            <MarkdownRenderer content={card.answer || "（暂无参考答案）"} breaks />
          </div>
        ) : (
          <button className="quiz-btn reveal" onClick={() => setRevealed(true)}>
            显示答案
          </button>
        )}
        {revealed && <CardInteractionBar cardId={card.id} ix={ix} />}
      </div>

      {revealed && (
        <div className="quiz-grade-row">
          {GRADE_BUTTONS.map((b) => (
            <button
              key={b.grade}
              className={`quiz-grade ${b.grade}`}
              title={b.hint}
              onClick={() => handleGrade(b.grade)}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- add / edit form ---------- */

/** Toolbar actions that wrap/prefix the current selection in the textarea. */
type FormatKind = "bold" | "highlight" | "code" | "bullet" | "number" | "br";

function CardForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Card;
  onSave: (data: { category: string; question: string; answer: string }) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [category, setCategory] = useState(initial?.category ?? QUIZ_CATEGORIES[0]);
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Apply a markdown format to the current selection, then restore focus.
  const applyFormat = (kind: FormatKind) => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = answer.slice(0, start);
    const sel = answer.slice(start, end);
    const after = answer.slice(end);

    let next = answer;
    let caretStart = start;
    let caretEnd = end;

    const wrap = (mark: string, placeholder: string) => {
      const body = sel || placeholder;
      next = `${before}${mark}${body}${mark}${after}`;
      caretStart = start + mark.length;
      caretEnd = caretStart + body.length;
    };
    const prefixLines = (prefix: (i: number) => string) => {
      const body = sel || "要点";
      const lines = body.split("\n");
      const out = lines.map((ln, i) => `${prefix(i)}${ln}`).join("\n");
      // ensure the list starts on its own line
      const lead = before.length === 0 || before.endsWith("\n") ? "" : "\n";
      next = `${before}${lead}${out}${after}`;
      caretStart = start + lead.length;
      caretEnd = caretStart + out.length;
    };

    switch (kind) {
      case "bold":
        wrap("**", "重点");
        break;
      case "highlight":
        wrap("==", "高亮");
        break;
      case "code":
        wrap("`", "code");
        break;
      case "bullet":
        prefixLines(() => "- ");
        break;
      case "number":
        prefixLines((i) => `${i + 1}. `);
        break;
      case "br": {
        // hard line break at the caret
        next = `${before}\n${after}`;
        caretStart = caretEnd = start + 1;
        break;
      }
    }

    setAnswer(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(caretStart, caretEnd);
    });
  };

  const TOOLS: { kind: FormatKind; label: string; title: string }[] = [
    { kind: "bold", label: "加粗", title: "**重点**" },
    { kind: "highlight", label: "高亮", title: "==高亮==（黄底标记）" },
    { kind: "code", label: "代码", title: "`code`" },
    { kind: "bullet", label: "• 列表", title: "无序列表" },
    { kind: "number", label: "1. 列表", title: "有序列表" },
    { kind: "br", label: "↵ 换行", title: "插入换行（题库中单个换行即生效）" },
  ];

  return (
    <div className="quiz-form">
      <select
        className="quiz-input"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      >
        {QUIZ_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <input
        className="quiz-input"
        placeholder="问题"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        autoFocus
      />

      <div className="quiz-format-toolbar">
        {TOOLS.map((t) => (
          <button
            key={t.kind}
            type="button"
            className="quiz-fmt-btn"
            title={t.title}
            onMouseDown={(e) => e.preventDefault() /* keep textarea selection */}
            onClick={() => applyFormat(t.kind)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <textarea
        ref={taRef}
        className="quiz-input quiz-textarea"
        placeholder="参考答案（支持 Markdown：**加粗** ==高亮== `代码` - 列表；直接回车即换行）"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
      />

      {answer.trim() && (
        <div className="quiz-form-preview">
          <div className="quiz-form-preview-label">预览</div>
          <div className="quiz-row-answer markdown-body">
            <MarkdownRenderer content={answer} breaks />
          </div>
        </div>
      )}

      <div className="quiz-form-actions">
        <button className="quiz-btn ghost" onClick={onCancel}>
          取消
        </button>
        <button
          className="quiz-btn primary"
          disabled={!question.trim()}
          onClick={() => onSave({ category, question: question.trim(), answer: answer.trim() })}
        >
          保存
        </button>
      </div>
    </div>
  );
}

/* ---------- main view ---------- */

export default function QuizView(): React.ReactElement {
  const {
    cards,
    sync,
    statusFor,
    dueCards,
    counts,
    grade,
    addCard,
    editCard,
    deleteCard,
    resetProgress,
  } = useQuiz();

  const SYNC_LABEL: Record<string, string> = {
    loading: "载入中…",
    saving: "同步中…",
    synced: "已同步",
    offline: "离线（本地已存）",
  };

  const ix = useCardInteractions();
  const { user } = useUserInfo();
  const isAdmin = !!(user?.isAdmin || (user?.role ?? "").toLowerCase() === "admin");

  const [mode, setMode] = useState<"browse" | "review">("browse");
  const [reviewQueue, setReviewQueue] = useState<Card[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const startReview = () => {
    if (dueCards.length === 0) return;
    setReviewQueue(dueCards);
    setMode("review");
  };

  const filtered = useMemo(
    () =>
      cards.filter((c) => {
        if (cat && c.category !== cat) return false;
        if (q.trim()) {
          const hay = `${c.question} ${c.answer}`.toLowerCase();
          if (!hay.includes(q.trim().toLowerCase())) return false;
        }
        return true;
      }),
    [cards, cat, q],
  );

  const byCategory = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const c of filtered) {
      const arr = map.get(c.category) ?? [];
      arr.push(c);
      map.set(c.category, arr);
    }
    return map;
  }, [filtered]);

  if (mode === "review") {
    return (
      <div className="quiz-view">
        <ReviewMode
          queue={reviewQueue}
          ix={ix}
          onGrade={grade}
          onExit={() => setMode("browse")}
        />
      </div>
    );
  }

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="quiz-view">
      <header className="quiz-header">
        <div>
          <h2>自测题库</h2>
          <p className="quiz-hint">
            Anki 式间隔重排 — 翻卡自评，系统按记忆曲线安排下次复习。题库全组共享，进度按各自账号保存。
            {isAdmin ? "（你是管理员，可编辑题目）" : `（题目由管理员维护，你的身份：${roleLabel(user)}）`}
          </p>
        </div>
        <div className="quiz-stats">
          <span>共 {counts.total}</span>
          <span className="quiz-stat-due">待复习 {counts.due + counts.new}</span>
          <span>已掌握 {counts.done}</span>
          <span className={`quiz-sync ${sync}`} title="题库与进度同步到坚果云 WebDAV">
            {SYNC_LABEL[sync]}
          </span>
        </div>
      </header>

      <div className="quiz-actions-bar">
        <button
          className="quiz-btn primary big"
          disabled={dueCards.length === 0}
          onClick={startReview}
        >
          {dueCards.length > 0
            ? `开始复习（${dueCards.length} 张）`
            : "今日已全部复习 🎉"}
        </button>
        {isAdmin && (
          <button className="quiz-btn ghost" onClick={() => setAdding(true)}>
            + 添加题目
          </button>
        )}
        <button
          className="quiz-btn ghost"
          title="清空所有复习进度（题目保留）"
          onClick={() => {
            if (confirm("确定清空全部复习进度？题目本身会保留。")) resetProgress();
          }}
        >
          重置进度
        </button>
      </div>

      <div className="quiz-filters">
        <input
          className="quiz-input"
          placeholder="搜索题目 / 答案…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="quiz-tagbar">
        <button
          className={`quiz-tag ${cat === null ? "active" : ""}`}
          onClick={() => setCat(null)}
        >
          全部
        </button>
        {QUIZ_CATEGORIES.map((c) => (
          <button
            key={c}
            className={`quiz-tag ${cat === c ? "active" : ""}`}
            onClick={() => setCat(cat === c ? null : c)}
          >
            {c}
          </button>
        ))}
      </div>

      {adding && isAdmin && (
        <CardForm
          onSave={(data) => {
            addCard(data);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      <div className="quiz-list">
        {[...byCategory.entries()].map(([category, list]) => (
          <div key={category} className="quiz-cat-group">
            <div className="quiz-cat-title">
              {category} <span className="quiz-cat-count">{list.length}</span>
            </div>
            {list.map((c, i) => {
              const status = statusFor(c.id);
              const isOpen = expanded.has(c.id);
              return (
                <div key={c.id} className={`quiz-row ${status}`}>
                  {editingId === c.id && isAdmin ? (
                    <CardForm
                      initial={c}
                      onSave={(data) => {
                        editCard(c.id, data);
                        setEditingId(null);
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <>
                      <div className="quiz-row-head" onClick={() => toggleExpand(c.id)}>
                        <span className="quiz-row-num">{i + 1}</span>
                        <span className="quiz-row-q">{c.question}</span>
                        <span className={`quiz-status ${status}`}>
                          {STATUS_LABEL[status]}
                        </span>
                      </div>
                      {isOpen && (
                        <div className="quiz-row-body">
                          <div className="quiz-row-answer markdown-body">
                            <MarkdownRenderer
                              content={c.answer || "（暂无参考答案，点编辑补充）"}
                              breaks
                            />
                          </div>
                          {isAdmin && (
                            <div className="quiz-row-tools">
                              <button
                                className="quiz-btn ghost sm"
                                onClick={() => setEditingId(c.id)}
                              >
                                编辑
                              </button>
                              <button
                                className="quiz-btn ghost sm danger"
                                onClick={() => {
                                  if (confirm("删除这道题？")) deleteCard(c.id);
                                }}
                              >
                                删除
                              </button>
                            </div>
                          )}
                          <CardInteractionBar cardId={c.id} ix={ix} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {filtered.length === 0 && <p className="quiz-note">没有匹配的题目。</p>}
      </div>
    </div>
  );
}
