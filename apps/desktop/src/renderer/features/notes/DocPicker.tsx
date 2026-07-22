import { useEffect, useMemo, useState } from "react";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { unwrapIpc } from "../../lib/ipc";
import { useUIStore } from "../../state/uiStore";
import type { NoteLink } from "./types";

interface DocHit {
  id: string;
  urlId?: string;
  title: string;
}

// documents.viewed → 文档对象直出；documents.search → { document, context }
function normalize(rows: unknown[]): DocHit[] {
  return rows
    .map((r) => {
      const o = r as Record<string, unknown>;
      const d = (o.document ?? o) as Record<string, unknown>;
      return {
        id: d.id as string,
        urlId: d.urlId as string | undefined,
        title: (d.title as string) || "无标题",
      };
    })
    .filter((d) => !!d.id);
}

export default function DocPicker({
  onClose,
  onPick,
  existing,
}: {
  onClose: () => void;
  onPick: (link: NoteLink) => void;
  existing: NoteLink[];
}): React.ReactElement {
  const api = useElectronAPI();
  const profileId = useUIStore((s) => s.activeProfileId);
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<DocHit[]>([]);
  const [hits, setHits] = useState<DocHit[]>([]);
  const has = useMemo(
    () => new Set(existing.map((e) => e.docId)),
    [existing],
  );

  useEffect(() => {
    if (!profileId) return;
    void unwrapIpc<{ data: unknown[] }>(
      api.call(profileId, "documents.viewed", { limit: 15 }),
    )
      .then((r) => setRecent(normalize(r.data ?? [])))
      .catch(() => setRecent([]));
  }, [api, profileId]);

  useEffect(() => {
    if (!profileId || !q.trim()) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      void unwrapIpc<{ data: unknown[] }>(
        api.call(profileId, "documents.search", { query: q.trim(), limit: 15 }),
      )
        .then((r) => setHits(normalize(r.data ?? [])))
        .catch(() => setHits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [api, profileId, q]);

  const list = q.trim() ? hits : recent;
  return (
    <div className="doc-picker-backdrop" onClick={onClose}>
      <div className="doc-picker" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="doc-picker-input"
          placeholder="搜索文档标题…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="doc-picker-hint">
          {q.trim() ? "搜索结果" : "最近浏览"}
        </div>
        <ul className="doc-picker-list">
          {list.map((d) => (
            <li key={d.id}>
              <button
                disabled={has.has(d.id)}
                onClick={() => {
                  onPick({ docId: d.id, urlId: d.urlId, title: d.title });
                  onClose();
                }}
              >
                📄 {d.title}
                {has.has(d.id) ? "（已关联）" : ""}
              </button>
            </li>
          ))}
          {list.length === 0 && (
            <li className="doc-picker-empty">
              {q.trim() ? "无匹配文档" : "暂无最近浏览"}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
