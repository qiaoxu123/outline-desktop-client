import { useState, useRef, useEffect, useCallback } from "react";
import { useUIStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { unwrapIpc } from "../../lib/ipc";
import "./AIAssistantPanel.css";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type ChatMode = "currentDoc" | "knowledgeBase";

export default function AIAssistantPanel({
  onClose,
}: {
  onClose: () => void;
}): React.ReactElement {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const currentDocTitle = useUIStore((s) => s.currentDocTitle);
  const currentDocContent = useUIStore((s) => s.currentDocContent);
  const [mode, setMode] = useState<ChatMode>("currentDoc");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const msgsEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = useCallback(async () => {
    const q = input.trim();
    if (!q || loading) return;

    // Validate preconditions before adding the message
    if (mode === "currentDoc" && !currentDocContent) {
      setError("请先打开一个文档，或切换到「知识库搜索」模式。");
      return;
    }
    if (mode === "knowledgeBase" && !activeProfileId) {
      setError("未连接到服务器");
      return;
    }

    setInput("");
    setError(null);

    const userMsg: ChatMessage = { role: "user", content: q };
    const next = [...messages, userMsg];
    setMessages(next);
    setLoading(true);

    try {
      // Prepare context based on mode
      let context = "";
      if (mode === "currentDoc") {
        context = `Document Title: ${currentDocTitle ?? "(untitled)"}\n\nDocument Content:\n${currentDocContent}`;
      } else {
        // Knowledge base search mode
        try {
          const searchResult = await unwrapIpc<{
            data: { id: string; document?: { title?: string }; title?: string; context?: string }[];
          }>(
            api.call(activeProfileId, "documents.search", {
              query: q,
              limit: 5,
            }),
          );
          const docs = searchResult.data ?? [];
          if (docs.length === 0) {
            context =
              "(No matching documents found in the knowledge base. Answer based on your general knowledge.)";
          } else {
            context = "Search results from the knowledge base:\n\n";
            for (const d of docs) {
              const title = d.document?.title ?? d.title ?? "(untitled)";
              const snippet = (d.context ?? "").slice(0, 300);
              context += `- ${title}: ${snippet}\n`;
            }
          }
        } catch {
          context =
            "(Search unavailable. Answer based on your general knowledge.)";
        }
      }

      // Call AI
      const result = await unwrapIpc<{ answer: string }>(
        api.ai.chat({
          question: q,
          context,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      );

      setMessages([...next, { role: "assistant", content: result.answer }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "请求失败";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, mode, currentDocContent, currentDocTitle, activeProfileId, api]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="ai-panel">
      <div className="ai-header">
        <span className="ai-title">AI 助手</span>
        <div className="ai-mode-toggle">
          <button
            className={`ai-mode-btn ${mode === "currentDoc" ? "active" : ""}`}
            onClick={() => setMode("currentDoc")}
          >
            当前文档
          </button>
          <button
            className={`ai-mode-btn ${mode === "knowledgeBase" ? "active" : ""}`}
            onClick={() => setMode("knowledgeBase")}
          >
            知识库搜索
          </button>
        </div>
        <button className="ai-close" onClick={onClose} title="关闭">
          ✕
        </button>
      </div>

      <div className="ai-messages">
        {messages.length === 0 && (
          <div className="ai-empty">
            <p>
              {mode === "currentDoc"
                ? currentDocTitle
                  ? `当前文档：${currentDocTitle}`
                  : "打开一个文档后，可针对其内容提问"
                : "输入问题，我会搜索知识库后回答"}
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ${m.role}`}>
            <div className="ai-msg-label">
              {m.role === "user" ? "👤" : "🤖"}
            </div>
            <div className="ai-msg-content">
              {m.content.split("\n").map((line, j) => (
                <span key={j}>
                  {line}
                  {j < m.content.split("\n").length - 1 && <br />}
                </span>
              ))}
            </div>
          </div>
        ))}
        {loading && (
          <div className="ai-msg assistant">
            <div className="ai-msg-label">🤖</div>
            <div className="ai-msg-content ai-typing">
              <span className="ai-dot" />
              <span className="ai-dot" />
              <span className="ai-dot" />
            </div>
          </div>
        )}
        {error && <div className="ai-error">{error}</div>}
        <div ref={msgsEndRef} />
      </div>

      <div className="ai-input-row">
        <textarea
          ref={inputRef}
          className="ai-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            mode === "currentDoc"
              ? "针对当前文档提问…"
              : "搜索知识库并提问…"
          }
          rows={2}
          disabled={loading}
        />
        <button
          className="ai-send"
          onClick={send}
          disabled={!input.trim() || loading}
        >
          发送
        </button>
      </div>
    </div>
  );
}
