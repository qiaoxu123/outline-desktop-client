import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useUIStore } from "../../state/uiStore";
import { OIcon } from "../../components/outlineIcons";
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
  document?: {
    id: string;
    title: string;
    emoji?: string | null;
    collectionId?: string;
    updatedAt?: string;
    updatedBy?: { name?: string } | null;
  };
}

interface SearchResponse {
  data: SearchItem[];
}

interface OutlineCollection {
  id: string;
  name: string;
  emoji?: string | null;
}

interface FlatResult {
  id: string;
  title: string;
  emoji?: string | null;
  context: string;
  collectionId?: string;
  updatedAt?: string;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

/** 相对时间，与网页版一致的文案（刚刚 / N 分钟前 / N 小时前 / N 天前）。 */
function timeAgo(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const min = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toLocaleDateString();
}

export default function SearchView(): React.ReactElement {
  const api = useElectronAPI();
  const navigate = useNavigate();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const selectDocument = useUIStore((s) => s.selectDocument);
  const [query, setQuery] = useState("");
  const [collectionFilter, setCollectionFilter] = useState("");
  const [results, setResults] = useState<FlatResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  // 集合列表：填充筛选下拉 + 结果集合名映射。
  const { data: collections } = useQuery({
    queryKey: ["profile", activeProfileId, "collections"],
    queryFn: () =>
      unwrapIpc<{ data: OutlineCollection[] }>(
        api.collections.list(activeProfileId!),
      ),
    enabled: !!activeProfileId,
  });
  const collList = Array.isArray(collections)
    ? (collections as unknown as OutlineCollection[])
    : (collections?.data ?? []);
  const collectionName = (id?: string): string =>
    id ? (collList.find((c) => c.id === id)?.name ?? "") : "";

  const handleSearch = async () => {
    const q = query.trim();
    if (!q || !activeProfileId || searching) return;
    setSearching(true);
    setError("");

    try {
      const response = await unwrapIpc<SearchResponse>(
        api.documents.search(activeProfileId, {
          query: q,
          ...(collectionFilter ? { collectionId: collectionFilter } : {}),
        }),
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
            collectionId: doc?.collectionId,
            updatedAt: doc?.updatedAt,
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
          <span className="search-icon">
            <OIcon name="search" size={20} />
          </span>
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
        <div className="search-filters">
          <select
            className="search-filter-select"
            value={collectionFilter}
            onChange={(e) => setCollectionFilter(e.target.value)}
            aria-label="按集合筛选"
          >
            <option value="">全部集合</option>
            {collList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji ? `${c.emoji} ` : ""}
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="search-error">{error}</div>}

      {!searched && !error && (
        <div className="search-empty">
          <p>搜索整个知识库的全文内容</p>
          <p className="search-hint">输入关键词后按回车，可按集合筛选</p>
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
          {results.map((r) => {
            const collName = collectionName(r.collectionId);
            return (
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
                {(collName || r.updatedAt) && (
                  <div className="search-result-meta">
                    {collName && (
                      <span className="search-result-collection">
                        {collName}
                      </span>
                    )}
                    {r.updatedAt && <span>{timeAgo(r.updatedAt)}更新</span>}
                  </div>
                )}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
