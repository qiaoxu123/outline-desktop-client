import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useProfileStore, useUIStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import {
  useUserInfo,
  absoluteUrl,
  roleLabel,
  canUserEdit,
} from "../../hooks/useOutline";
import {
  ACTIVITY_ENTRIES,
  useActivityBarOrder,
  useSidebarMode,
  type ActivityEntry,
} from "../../components/sidebar/activityBarOrder";
import pkg from "../../../../package.json";
import "./SettingsView.css";

/* ---------- activity bar visibility settings ---------- */

const VISIBILITY_KEY = "ui.activityBar.visible";

function loadActivityVisible(): Set<string> {
  try {
    const raw = localStorage.getItem(VISIBILITY_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* */ }
  return new Set(ACTIVITY_ENTRIES.map((e) => e.key));
}

function saveActivityVisible(s: Set<string>): void {
  localStorage.setItem(VISIBILITY_KEY, JSON.stringify([...s]));
}

/* ---------- drag-to-reorder row for activity entries ---------- */

type DropPos = "before" | "after";

interface ActivityRowProps {
  entry: ActivityEntry;
  visible: boolean;
  onToggle: () => void;
  dragging: boolean;
  dropPos: DropPos | null;
  onDragStart: () => void;
  onDragOver: (pos: DropPos) => void;
}

function ActivityRow({
  entry,
  visible,
  onToggle,
  dragging,
  dropPos,
  onDragStart,
  onDragOver,
}: ActivityRowProps): React.ReactElement {
  const dropClass = dropPos ? `act-row-drop-${dropPos}` : "";
  return (
    <div
      className={`settings-activity-row ${dragging ? "act-row-dragging" : ""} ${dropClass}`}
      onMouseMove={(ev) => {
        if (!dragging) {
          // Only compute drop target when a drag is active and this row isn't the source
          const r = ev.currentTarget.getBoundingClientRect();
          const y = (ev.clientY - r.top) / r.height;
          const pos: DropPos = y < 0.5 ? "before" : "after";
          onDragOver(pos);
        }
      }}
    >
      <span
        className="act-row-grip"
        title="拖拽排序"
        onMouseDown={(ev) => {
          if (ev.button !== 0) return;
          ev.preventDefault();
          onDragStart();
        }}
      >
        ⋮⋮
      </span>
      <label className="act-row-label">
        <input
          type="checkbox"
          checked={visible}
          onChange={onToggle}
        />
        <span>{entry.label}</span>
      </label>
    </div>
  );
}

/* ---------- settings page ---------- */

export default function SettingsView(): React.ReactElement {
  const api = useElectronAPI();
  const profiles = useProfileStore((s) => s.profiles);
  const removeProfile = useProfileStore((s) => s.removeProfile);
  const updateProfile = useProfileStore((s) => s.updateProfile);
  const setActiveProfileId = useUIStore((s) => s.setActiveProfileId);
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const { user, team, isLoading, error } = useUserInfo();
  const avatar = absoluteUrl(user?.avatarUrl);
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const codeBlockTheme = useUIStore((s) => s.codeBlockTheme);
  const setCodeBlockTheme = useUIStore((s) => s.setCodeBlockTheme);
  const contentWidth = useUIStore((s) => s.contentWidth);
  const setContentWidth = useUIStore((s) => s.setContentWidth);

  const themeOptions: { value: "light" | "dark" | "system"; label: string }[] = [
    { value: "light", label: "浅色" },
    { value: "dark", label: "深色" },
    { value: "system", label: "跟随系统" },
  ];
  const codeBlockThemeOptions: { value: "light" | "dark" | "system"; label: string }[] = [
    { value: "system", label: "跟随主题" },
    { value: "light", label: "浅色" },
    { value: "dark", label: "深色" },
  ];

  const widthOptions: { value: 1 | 2 | 3 | 4 | 5; label: string }[] = [
    { value: 1, label: "最窄" },
    { value: 2, label: "较窄" },
    { value: 3, label: "适中" },
    { value: 4, label: "较宽" },
    { value: 5, label: "最宽" },
  ];

  const [activityVisible, setActivityVisible] = useState<Set<string>>(loadActivityVisible);
  const [order, setOrder] = useActivityBarOrder();
  const [sidebarMode, setSidebarMode] = useSidebarMode();

  /* ---------- workspace server URL ---------- */

  const [serverUrl, setServerUrl] = useState("");
  const [serverSaving, setServerSaving] = useState(false);
  const [serverMsg, setServerMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const queryClient = useQueryClient();

  // Sync the editable URL with the active profile (login, profile switch, …)
  useEffect(() => {
    setServerUrl(activeProfile?.serverUrl ?? "");
    setServerMsg(null);
  }, [activeProfile?.serverUrl]);

  // DnD state
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [over, setOver] = useState<{ key: string; pos: DropPos } | null>(null);
  const overRef = useRef(over);
  overRef.current = over;

  /* ---------- AI assistant settings ---------- */

  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState("deepseek-chat");
  const [aiBaseUrl, setAiBaseUrl] = useState("https://api.deepseek.com/v1");
  const [aiSaving, setAiSaving] = useState(false);
  const [aiSaveMsg, setAiSaveMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    api.ai
      .getConfig()
      .then((raw) => {
        const r = raw as
          | { ok: boolean; data?: { model?: string; baseUrl?: string } }
          | undefined;
        if (r?.ok && r.data) {
          setAiModel(r.data.model ?? "deepseek-chat");
          setAiBaseUrl(r.data.baseUrl ?? "https://api.deepseek.com/v1");
        }
      })
      .catch(() => {});
  }, [api]);

  const handleSaveAiConfig = async () => {
    setAiSaving(true);
    setAiSaveMsg(null);
    try {
      const result = (await api.ai.setConfig({
        apiKey: aiApiKey || undefined,
        model: aiModel,
        baseUrl: aiBaseUrl,
      })) as { ok: boolean; error?: { message?: string } };
      if (result.ok) {
        setAiApiKey("");
        setAiSaveMsg({ type: "success", text: "已保存" });
        setTimeout(() => setAiSaveMsg(null), 2000);
      } else {
        setAiSaveMsg({
          type: "error",
          text: result.error?.message ?? "保存失败",
        });
      }
    } catch {
      setAiSaveMsg({ type: "error", text: "保存失败" });
    } finally {
      setAiSaving(false);
    }
  };

  // Build ordered entries
  const entryMap = new Map(ACTIVITY_ENTRIES.map((e) => [e.key, e]));
  const orderedEntries = order
    .map((key) => entryMap.get(key))
    .filter((e): e is ActivityEntry => !!e);

  const toggleActivity = (key: string) => {
    setActivityVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveActivityVisible(next);
      return next;
    });
  };

  const performReorder = (fromKey: string, toKey: string, pos: DropPos) => {
    if (fromKey === toKey) return;
    setOrder((prev) => {
      const next = [...prev];
      const fromIdx = next.indexOf(fromKey);
      if (fromIdx === -1) return prev;
      next.splice(fromIdx, 1);
      const toIdx = next.indexOf(toKey);
      if (toIdx === -1) return prev;
      next.splice(pos === "before" ? toIdx : toIdx + 1, 0, fromKey);
      return next;
    });
  };

  // Global mouseup to complete the drag
  useEffect(() => {
    if (!dragKey) return;
    const onUp = () => {
      const cur = overRef.current;
      if (cur) performReorder(dragKey, cur.key, cur.pos);
      setDragKey(null);
      setOver(null);
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [dragKey]);

  const handleSaveServer = async () => {
    if (!activeProfileId) return;
    const url = serverUrl.trim().replace(/\/+$/, "");
    if (!url || url === activeProfile?.serverUrl) return;
    setServerSaving(true);
    setServerMsg(null);
    try {
      const result = (await api.profiles.update({
        id: activeProfileId,
        serverUrl: url,
      })) as { ok: boolean; error?: { message?: string } } | undefined;
      if (!result?.ok) {
        setServerMsg({
          type: "error",
          text: result?.error?.message ?? "保存失败",
        });
        return;
      }
      updateProfile(activeProfileId, { serverUrl: url });
      setServerUrl(url);
      setServerMsg({ type: "success", text: "已保存，正在验证凭据…" });
      // The token may or may not be accepted by the new server — verify it
      // and surface a re-login hint when it is rejected.
      const v = (await api.profiles.verify(activeProfileId)) as {
        ok: boolean;
        data?: { valid: boolean; reason?: string };
      };
      if (v.ok && v.data?.valid) {
        setServerMsg({ type: "success", text: "已保存并验证通过" });
      } else if (v.ok && v.data && v.data.reason === "auth") {
        setServerMsg({
          type: "error",
          text: "服务器已更新，但当前凭据在新服务器无效，请退出后重新登录。",
        });
      } else {
        setServerMsg({ type: "success", text: "已保存" });
      }
      // Team/user info now comes from the new server.
      void queryClient.invalidateQueries({
        queryKey: ["profile", activeProfileId, "userInfo"],
      });
    } catch {
      setServerMsg({ type: "error", text: "保存失败" });
    } finally {
      setServerSaving(false);
    }
  };

  const handleLogout = async () => {
    if (activeProfileId) {
      await api.profiles.delete(activeProfileId);
      removeProfile(activeProfileId);
      setActiveProfileId(null);
    }
  };

  return (
    <div className="settings-view">
      <h2 className="settings-title">设置</h2>

      <section className="settings-section">
        <h3>账号</h3>
        {isLoading && <p className="settings-description">加载用户信息…</p>}
        {!!error && (
          <p className="settings-description settings-error-text">
            无法加载用户信息（{error instanceof Error ? error.message : "未知错误"}）
          </p>
        )}
        {user && (
          <div className="settings-user-card">
            {avatar ? (
              <img className="settings-avatar" src={avatar} alt={user.name} />
            ) : (
              <div className="settings-avatar settings-avatar-fallback">
                {(user.name || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="settings-user-info">
              <div className="settings-user-name">{user.name}</div>
              {user.email && (
                <div className="settings-user-email">{user.email}</div>
              )}
              <div className="settings-user-badges">
                <span className="settings-user-role">{roleLabel(user)}</span>
                {!canUserEdit(user) && (
                  <span className="settings-user-role muted">无编辑权限</span>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="settings-section">
        <h3>外观</h3>
        <div className="settings-theme-toggle">
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              className={`settings-theme-option ${theme === opt.value ? "active" : ""}`}
              onClick={() => setTheme(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="settings-field-label">代码块背景</div>
        <div className="settings-theme-toggle">
          {codeBlockThemeOptions.map((opt) => (
            <button
              key={opt.value}
              className={`settings-theme-option ${codeBlockTheme === opt.value ? "active" : ""}`}
              onClick={() => setCodeBlockTheme(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="settings-field-label">页面宽度</div>
        <div className="settings-theme-toggle">
          {widthOptions.map((opt) => (
            <button
              key={opt.value}
              className={`settings-theme-option ${contentWidth === opt.value ? "active" : ""}`}
              onClick={() => setContentWidth(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h3>AI 助手</h3>
        <p className="settings-description">
          使用 DeepSeek API 为文档问答提供智能支持。密钥仅保存在本地。
        </p>
        <div className="settings-field-label">API Key</div>
        <input
          type="password"
          className="share-search"
          placeholder="sk-..."
          value={aiApiKey}
          onChange={(e) => setAiApiKey(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <div className="settings-field-label">模型</div>
        <input
          type="text"
          className="share-search"
          placeholder="deepseek-chat"
          value={aiModel}
          onChange={(e) => setAiModel(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <div className="settings-field-label">API 地址</div>
        <input
          type="text"
          className="share-search"
          placeholder="https://api.deepseek.com/v1"
          value={aiBaseUrl}
          onChange={(e) => setAiBaseUrl(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <button
          className="share-copy"
          onClick={handleSaveAiConfig}
          disabled={aiSaving}
        >
          {aiSaving ? "保存中…" : "保存"}
        </button>
        {aiSaveMsg && (
          <p
            className={
              aiSaveMsg.type === "error" ? "share-error" : "share-feedback"
            }
          >
            {aiSaveMsg.text}
          </p>
        )}
      </section>

      <section className="settings-section">
        <h3>侧栏快捷入口</h3>
        <p className="settings-description">
          拖拽手柄（⋮⋮）调整排列顺序，勾选框控制显示/隐藏。
        </p>
        <div className="settings-field-label">显示模式</div>
        <div className="settings-theme-toggle">
          <button
            className={`settings-theme-option ${sidebarMode === "integrated" ? "active" : ""}`}
            onClick={() => setSidebarMode("integrated")}
          >
            融入侧栏
          </button>
          <button
            className={`settings-theme-option ${sidebarMode === "separate" ? "active" : ""}`}
            onClick={() => setSidebarMode("separate")}
          >
            独立图标栏
          </button>
        </div>
        <div className="settings-activity-list">
          {orderedEntries.map((e) => {
            const isDragSource = dragKey === e.key;
            const dropPos =
              !isDragSource && over?.key === e.key ? over.pos : null;
            return (
              <ActivityRow
                key={e.key}
                entry={e}
                visible={activityVisible.has(e.key)}
                onToggle={() => toggleActivity(e.key)}
                dragging={isDragSource}
                dropPos={dropPos}
                onDragStart={() => setDragKey(e.key)}
                onDragOver={(pos) =>
                  setOver((o) =>
                    o?.key === e.key && o.pos === pos
                      ? o
                      : { key: e.key, pos },
                  )
                }
              />
            );
          })}
        </div>
      </section>

      <section className="settings-section">
        <h3>工作区</h3>
        <div className="settings-field-label">服务器地址</div>
        <div className="settings-server-row">
          <input
            className="share-search"
            type="text"
            value={serverUrl}
            onChange={(e) => {
              setServerUrl(e.target.value);
              setServerMsg(null);
            }}
            disabled={serverSaving}
            spellCheck={false}
            style={{ marginBottom: 0, flex: 1 }}
          />
          <button
            className="share-copy"
            onClick={() => void handleSaveServer()}
            disabled={
              serverSaving ||
              serverUrl.trim().replace(/\/+$/, "") === activeProfile?.serverUrl
            }
          >
            {serverSaving ? "验证中…" : "保存"}
          </button>
        </div>
        {serverMsg && (
          <p
            className={
              serverMsg.type === "error" ? "share-error" : "share-feedback"
            }
          >
            {serverMsg.text}
          </p>
        )}
        <div className="settings-server-info" style={{ marginTop: 16 }}>
          <div className="server-info-row">
            <span className="server-info-label">团队</span>
            <span className="server-info-value">
              {team?.name ?? activeProfile?.name ?? "—"}
            </span>
          </div>
          {activeProfile?.createdAt && (
            <div className="server-info-row">
              <span className="server-info-label">登录时间</span>
              <span className="server-info-value">
                {new Date(activeProfile.createdAt).toLocaleString()}
              </span>
            </div>
          )}
        </div>

        <button className="logout-button" onClick={() => void handleLogout()}>
          退出登录
        </button>
      </section>

      <section className="settings-section">
        <h3>关于</h3>
        <p className="settings-description">
          Outline Desktop v{pkg.version} — macOS / Windows / Linux
        </p>
      </section>
    </div>
  );
}
