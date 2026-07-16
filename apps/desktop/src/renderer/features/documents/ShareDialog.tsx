import { useState } from "react";
import { OIcon } from "../../components/outlineIcons";
import "./ShareDialog.css";

/**
 * Internal share panel: shows the document's own URL to copy and send to team
 * members (they open it after login, subject to their document access). This
 * server has public `/s/` sharing disabled and the lab only shares internally,
 * so the document link is the right, always-working share.
 */
export function ShareDialog({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!url) return;
    void navigator.clipboard.writeText(url).then(() => {
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

        <p className="share-desc">
          把下面的链接发给团队成员，他们登录后即可查看本文档（需对该文档有访问权限）。
        </p>
        <div className="share-url-row">
          <input
            className="share-url"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button className="share-copy" onClick={copy}>
            {copied ? "已复制" : "复制"}
          </button>
        </div>
        <p className="share-hint">
          这是知识库内部链接，仅登录且有权限的成员可打开，不对外公开。
        </p>
      </div>
    </div>
  );
}
