import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { OutlineCollection, OutlineDocument } from "@outline/shared-types";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { useUIStore } from "../../state/uiStore";
import { unwrapIpc } from "../../lib/ipc";
import { toExportMarkdown } from "./outlineSerialize";
import type { OutlineDoc } from "./types";

export interface ExportDialogProps {
  doc: OutlineDoc;
  onClose: () => void;
}

/**
 * 导出对话框：选一个目标集合，把大纲序列化为 markdown 建一篇新的 Outline 文档。
 *
 * `collections.list` / `documents.create` 走同一套 IPC envelope（`{ ok, data }`），
 * 用 `unwrapIpc` 解一层；`documents.create` 的 `data` 本身又是
 * `{ data: OutlineDocument }`（api-client 的 `createDocument` 返回形状），所以拿
 * 新文档 id 要再挖一层 `.data.id`。
 */
export default function ExportDialog(props: ExportDialogProps): React.ReactElement {
  const api = useElectronAPI();
  const navigate = useNavigate();
  const profileId = useUIStore((s) => s.activeProfileId);
  const [collections, setCollections] = useState<OutlineCollection[]>([]);
  const [collectionId, setCollectionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profileId) return;
    void (async () => {
      try {
        const res = await unwrapIpc<OutlineCollection[] | { data: OutlineCollection[] }>(
          api.collections.list(profileId),
        );
        const list = Array.isArray(res) ? res : res?.data ?? [];
        setCollections(list);
        if (list[0]) setCollectionId(list[0].id);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, [api, profileId]);

  const doExport = async () => {
    if (!profileId || !collectionId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await unwrapIpc<{ data: OutlineDocument }>(
        api.documents.create({
          profileId,
          title: props.doc.title,
          text: toExportMarkdown(props.doc),
          collectionId,
        }),
      );
      const id = result.data?.id;
      props.onClose();
      if (id) navigate(`/document/${id}`);
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <div className="ol-modal-backdrop" onClick={props.onClose}>
      <div className="ol-modal" onClick={(e) => e.stopPropagation()}>
        <h3>导出为 Outline 文档</h3>
        <label>目标集合</label>
        <select value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {error && <div className="ol-modal-err">{error}</div>}
        <div className="ol-modal-actions">
          <button onClick={props.onClose}>取消</button>
          <button disabled={busy || !collectionId} onClick={doExport}>
            {busy ? "导出中…" : "导出并打开"}
          </button>
        </div>
      </div>
    </div>
  );
}
