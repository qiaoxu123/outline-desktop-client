import { useEffect, useState } from "react";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { useUIStore } from "../../state/uiStore";
import { unwrapIpc } from "../../lib/ipc";
import { OIcon } from "../../components/outlineIcons";
import "./ShareDialog.css";

interface ShareData {
  id: string;
  url: string;
  published: boolean;
  includeChildDocuments?: boolean;
}

/** Pull the share object out of whatever shape the API returned. */
function readShare(r: unknown): ShareData | null {
  if (!r || typeof r !== "object") return null;
  const obj = r as Record<string, unknown>;
  const s = (obj.data ?? obj) as Record<string, unknown>;
  if (!s || typeof s.id !== "string" || typeof s.url !== "string") return null;
  return {
    id: s.id,
    url: s.url,
    published: !!s.published,
    includeChildDocuments: !!s.includeChildDocuments,
  };
}

/**
 * Per-document share panel: get-or-create a public share link, copy it, toggle
 * public access / child documents, or stop sharing. Opened from the article's
 * top-right 分享 button. Publishing may be blocked server-side (team setting or
 * permissions) — that's surfaced as a note rather than a hard failure.
 */
export function ShareDialog({
  documentId,
  onClose,
}: {
  documentId: string;
  onClose: () => void;
}): React.ReactElement {
  const api = useElectronAPI();
  const pid = useUIStore((s) => s.activeProfileId);
  const [share, setShare] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // shares.info returns 204 (→ error here) when the doc isn't shared yet.
        const r = await unwrapIpc(
          api.call(pid!, "shares.info", { documentId }),
        );
        if (!cancelled) setShare(readShare(r));
      } catch {
        if (!cancelled) setShare(null);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [api, pid, documentId]);

  const run = async (
    method: string,
    params: Record<string, unknown>,
    onOk: (s: ShareData | null) => void,
    failMsg: string,
  ) => {
    setBusy(true);
    setNote("");
    try {
      const r = await unwrapIpc(api.call(pid!, method, params));
      onOk(readShare(r));
    } catch (e) {
      setNote(`${failMsg}${e instanceof Error ? `：${e.message}` : ""}`);
    }
    setBusy(false);
  };

  const create = () =>
    run("shares.create", { documentId }, (s) => setShare(s), "生成分享失败");

  const togglePublished = () => {
    if (!share) return;
    void run(
      "shares.update",
      { id: share.id, published: !share.published },
      (s) => s && setShare(s),
      "无法切换公开状态（服务器可能未开启公开分享，或权限不足）",
    );
  };

  const toggleChildren = () => {
    if (!share) return;
    void run(
      "shares.update",
      { id: share.id, includeChildDocuments: !share.includeChildDocuments },
      (s) => s && setShare(s),
      "更新失败",
    );
  };

  const revoke = () => {
    if (!share) return;
    void run("shares.revoke", { id: share.id }, () => setShare(null), "停止分享失败");
  };

  const copy = () => {
    if (!share) return;
    void navigator.clipboard.writeText(share.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="share-backdrop" onClick={onClose}>
      <div className="share-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="share-header">
          <span className="share-title">
            <OIcon name="globe" size={16} /> 分享此文档
          </span>
          <button className="share-close" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>

        {loading ? (
          <p className="share-note">加载中…</p>
        ) : !share ? (
          <>
            <p className="share-desc">生成一个分享链接，把这篇文档分享给他人。</p>
            <button className="share-primary" onClick={create} disabled={busy}>
              {busy ? "生成中…" : "生成分享链接"}
            </button>
          </>
        ) : (
          <>
            <div className="share-url-row">
              <input
                className="share-url"
                readOnly
                value={share.url}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button className="share-copy" onClick={copy}>
                {copied ? "已复制" : "复制"}
              </button>
            </div>
            <label className="share-opt">
              <input
                type="checkbox"
                checked={share.published}
                onChange={togglePublished}
                disabled={busy}
              />
              公开可访问（任何拿到链接的人无需登录即可查看）
            </label>
            <label className="share-opt">
              <input
                type="checkbox"
                checked={!!share.includeChildDocuments}
                onChange={toggleChildren}
                disabled={busy}
              />
              包含子文档
            </label>
            <button className="share-revoke" onClick={revoke} disabled={busy}>
              停止分享
            </button>
          </>
        )}

        {note && <p className="share-warn">{note}</p>}
        <p className="share-hint">
          未勾选「公开」时，仅对本文档有访问权限的团队成员可通过链接打开。
        </p>
      </div>
    </div>
  );
}
