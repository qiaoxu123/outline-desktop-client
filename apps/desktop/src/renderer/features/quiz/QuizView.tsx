import { useMemo, useState } from "react";
import { useQuiz, type Card, type Grade } from "./useQuiz";
import { QUIZ_CATEGORIES } from "./quizData";
import "./QuizView.css";

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
  onGrade,
  onExit,
}: {
  queue: Card[];
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
          <div className="quiz-card-answer">{card.answer || "（暂无参考答案）"}</div>
        ) : (
          <button className="quiz-btn reveal" onClick={() => setRevealed(true)}>
            显示答案
          </button>
        )}
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
      <textarea
        className="quiz-input quiz-textarea"
        placeholder="参考答案（可留空）"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
      />
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
    today,
    statusFor,
    dueCards,
    counts,
    grade,
    addCard,
    editCard,
    deleteCard,
    resetProgress,
  } = useQuiz();

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
            Anki 式间隔重排 — 翻卡自评，系统按记忆曲线安排下次复习。数据仅存于本机。
          </p>
        </div>
        <div className="quiz-stats">
          <span>共 {counts.total}</span>
          <span className="quiz-stat-due">待复习 {counts.due + counts.new}</span>
          <span>已掌握 {counts.done}</span>
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
        <button className="quiz-btn ghost" onClick={() => setAdding(true)}>
          + 添加题目
        </button>
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

      {adding && (
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
                  {editingId === c.id ? (
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
                          <div className="quiz-row-answer">
                            {c.answer || "（暂无参考答案，点编辑补充）"}
                          </div>
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
