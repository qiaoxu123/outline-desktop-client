import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useUIStore, useTabsStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { useStars, useToggleStar } from "../../hooks/useOutline";
import { unwrapIpc } from "../../lib/ipc";

export interface DocActionsHandle {
  /** Open the “…” menu at a screen position (right-click on the row). */
  openMenu: (x: number, y: number) => void;
}

interface DocActionsProps {
  docId: string;
  title: string;
  /** Known for collection-tree nodes; looked up from the doc otherwise. */
  collectionId?: string;
}

/**
 * Hover actions for a sidebar document node — “+” (new child) and “…” menu
 * (open in new tab / rename / star / duplicate / archive / delete), mirroring
 * Outline web's document context menu. Also opens via row right-click.
 */
const DocActions = forwardRef<DocActionsHandle, DocActionsProps>(
  function DocActions({ docId, title, collectionId }, handleRef) {
  const api = useElectronAPI();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const { starFor } = useStars();
  const { toggle: toggleStar } = useToggleStar();
  const star = starFor(docId);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [confirming, setConfirming] = useState<"archive" | "delete" | null>(
    null,
  );
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState(title);
  const renameRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const openTab = useTabsStore((s) => s.openTab);

  useImperativeHandle(handleRef, () => ({
    openMenu: (x, y) => {
      setMenuPos({ top: y + 4, left: x });
      setConfirming(null);
      setMenuOpen(true);
    },
  }));

  // Structural ops touch children/collection/tree queries — invalidating the
  // whole profile keeps every affected list fresh (same pattern as
  // useCreatePersonalNote).
  const invalidateAll = () =>
    void queryClient.invalidateQueries({
      queryKey: ["profile", activeProfileId],
    });

  const resolveCollectionId = async (): Promise<string> => {
    if (collectionId) return collectionId;
    const res = await unwrapIpc<{ data: { collectionId: string } }>(
      api.documents.info(activeProfileId!, docId),
    );
    return res.data.collectionId;
  };

  const createChild = useMutation({
    mutationFn: async () => {
      const colId = await resolveCollectionId();
      const res = await unwrapIpc<{ data: { id: string } }>(
        api.call(activeProfileId!, "documents.create", {
          title: "新文档",
          text: "",
          collectionId: colId,
          parentDocumentId: docId,
          publish: true,
        }),
      );
      return res.data.id;
    },
    onSuccess: (id) => {
      invalidateAll();
      navigate(`/document/${id}`);
    },
  });

  const run = useMutation({
    mutationFn: async (action: "rename" | "duplicate" | "archive" | "delete") => {
      switch (action) {
        case "rename": {
          const next = renameDraft.trim();
          if (!next || next === title) return;
          await unwrapIpc(
            api.call(activeProfileId!, "documents.update", {
              id: docId,
              title: next,
              publish: true,
            }),
          );
          // Direct cache update so sidebar reflects rename immediately
          queryClient.setQueryData(
            ["profile", activeProfileId, "document", docId],
            (old: { data?: { title?: string } } | undefined) =>
              old?.data ? { ...old, data: { ...old.data, title: next } } : old,
          );
          break;
        }
        case "duplicate":
          await unwrapIpc(
            api.call(activeProfileId!, "documents.duplicate", { id: docId }),
          );
          break;
        case "archive":
          await unwrapIpc(
            api.call(activeProfileId!, "documents.archive", { id: docId }),
          );
          break;
        case "delete":
          await unwrapIpc(
            api.call(activeProfileId!, "documents.delete", { id: docId }),
          );
          break;
      }
    },
    onSuccess: invalidateAll,
  });

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, left: rect.left });
    setConfirming(null);
    setMenuOpen(true);
  };

  // Close on Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const item = (
    label: string,
    onClick: () => void,
    danger = false,
  ): React.ReactElement => (
    <button
      key={label}
      className={`sb-menu-item ${danger ? "danger" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {label}
    </button>
  );

  return (
    <span className="sb-actions">
      <button
        className="sb-action-btn"
        title="新建子文档"
        disabled={createChild.isPending}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          createChild.mutate();
        }}
      >
        +
      </button>
      <button className="sb-action-btn" title="更多操作" onClick={openMenu}>
        ⋯
      </button>
      {/* rename modal */}
      {renameOpen && (
        <div className="sb-modal-backdrop" onClick={() => setRenameOpen(false)}>
          <div
            className="sb-modal sb-modal-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sb-modal-header">
              <span>重命名</span>
              <button
                className="history-close"
                onClick={() => setRenameOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="sb-modal-body" style={{ padding: "12px 14px" }}>
              <input
                ref={renameRef}
                className="sb-menu-rename-input"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setRenameOpen(false);
                    if (renameDraft.trim() && renameDraft.trim() !== title) {
                      run.mutate("rename");
                    }
                  } else if (e.key === "Escape") {
                    setRenameOpen(false);
                  }
                }}
                placeholder={title}
                style={{ width: "100%" }}
              />
              <div style={{ marginTop: 10, textAlign: "right" }}>
                <button
                  className="sb-personal-btn"
                  style={{ width: "auto", padding: "5px 16px" }}
                  disabled={!renameDraft.trim() || renameDraft.trim() === title}
                  onClick={() => {
                    setRenameOpen(false);
                    run.mutate("rename");
                  }}
                >
                  确认
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {menuOpen && (
        <div
          className="sb-menu-backdrop"
          onClick={() => setMenuOpen(false)}
          onContextMenu={(e) => { e.preventDefault(); setMenuOpen(false); }}
        >
        <div
          ref={menuRef}
          className="sb-menu"
          style={{ top: menuPos.top, left: menuPos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {item("在新标签页打开", () => {
            setMenuOpen(false);
            openTab({ documentId: docId, title });
          })}
          <div className="sb-menu-divider" />
          {item("新建子文档", () => {
            setMenuOpen(false);
            createChild.mutate();
          })}
          {item(star ? "取消收藏" : "收藏", () => {
            setMenuOpen(false);
            toggleStar(docId, star);
          })}
          {item("重命名…", () => {
            setMenuOpen(false);
            setRenameDraft(title);
            setRenameOpen(true);
            setTimeout(() => renameRef.current?.focus(), 50);
          })}
          {item("复制", () => {
            setMenuOpen(false);
            run.mutate("duplicate");
          })}
          <div className="sb-menu-divider" />
          {confirming === "archive"
            ? item(
                "确认归档？",
                () => {
                  setMenuOpen(false);
                  run.mutate("archive");
                },
                true,
              )
            : item("归档…", () => setConfirming("archive"))}
          {confirming === "delete"
            ? item(
                "确认删除？",
                () => {
                  setMenuOpen(false);
                  run.mutate("delete");
                },
                true,
              )
            : item("删除…", () => setConfirming("delete"))}
        </div>
        </div>
      )}
    </span>
  );
});

export default DocActions;
