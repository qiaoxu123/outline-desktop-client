import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUIStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { unwrapIpc } from "../../lib/ipc";
import "./SearchView.css";

/**
 * Outline's documents.search returns items shaped
 * { ranking, context, document: {...} } — flatten defensively in case of
 * older servers that return the document fields at the top level.
 */
interface SearchItem {
  id?: string;
  title?: string;
  context?: string;
  ranking?: number;
  document?: { id: string; title: string; emoji?: string | null };
}

interface SearchResponse {
  data: SearchItem[];
}

interface FlatResult {
  id: string;
  title: string;
  emoji?: string | null;
  context: string;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

export default function SearchView(): React.ReactElement {
  const api = useElectronAPI();
  const navigate = useNavigate();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const selectDocument = useUIStore((s) => s.selectDocument);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FlatResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async () => {
    const q = query.trim();
    if (!q || !activeProfileId || searching) return;
    setSearching(true);
    setError("");

    try {
      const response = await unwrapIpc<SearchResponse>(
        api.documents.search(activeProfileId, { query: q }),
      );

      const flattened: FlatResult[] = (response.data ?? [])
        .map((item): FlatResult | null => {
          const doc = item.document;
          const id = doc?.id ?? item.id;
          if (!id) return null;
          return {
            id,
            title: doc?.title ?? item.title ?? "Untitled",
            emoji: doc?.emoji ?? null,
            context: stripHtml(item.context ?? ""),
          };
        })
        .filter((r): r is FlatResult => r !== null);

      setResults(flattened);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "搜索失败，请重试");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="search-view">
      <div className="search-header">
        <div className="search-input-wrapper">
          <svg
            className="search-icon"
            width="18"
            height="18"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.975 1.975 0 00-.017.016zm-5.242.156a5 5 0 110-10 5 5 0 010 10z" />
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="搜索知识库文档…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
            autoFocus
          />
          <button
            className="search-button"
            onClick={() => void handleSearch()}
            disabled={searching || !query.trim()}
          >
            {searching ? "搜索中…" : "搜索"}
          </button>
        </div>
      </div>

      {error && <div className="search-error">{error}</div>}

      {!searched && !error && (
        <div className="search-empty">
          <p>搜索整个知识库的全文内容</p>
          <p className="search-hint">输入关键词后按回车</p>
        </div>
      )}

      {searched && results.length === 0 && !error && (
        <div className="search-empty">
          <p>没有找到与“{query}”相关的文档</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="search-results">
          <p className="search-results-count">{results.length} 条结果</p>
          {results.map((r) => (
            <a
              key={r.id}
              href={`#/document/${r.id}`}
              className="search-result-item"
              onClick={(e) => {
                e.preventDefault();
                selectDocument(r.id);
                navigate(`/document/${r.id}`);
              }}
            >
              <div className="search-result-title">
                {r.emoji && <span>{r.emoji} </span>}
                {r.title}
              </div>
              {r.context && (
                <div className="search-result-context">{r.context}</div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
