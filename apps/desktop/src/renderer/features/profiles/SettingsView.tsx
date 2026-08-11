import { useState, useRef, useEffect } from "react";
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

const SERVER_URL = "https://notes.jlu-mcns.site";

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
  const setActiveProfileId = useUIStore((s) => s.setActiveProfileId);
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const { user, team, isLoading, error } = useUserInfo();
  const avatar = absoluteUrl(user?.avatarUrl);
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const contentWidth = useUIStore((s) => s.contentWidth);
  const setContentWidth = useUIStore((s) => s.setContentWidth);

  const themeOptions: { value: "light" | "dark" | "system"; label: string }[] = [
    { value: "light", label: "浅色" },
    { value: "dark", label: "深色" },
    { value: "system", label: "跟随系统" },
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

  // DnD state
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [over, setOver] = useState<{ key: string; pos: DropPos } | null>(null);
  const overRef = useRef(over);
  overRef.current = over;

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
        <h3>侧栏快捷入口</h3>
        <p className="settings-description">
          拖拽手柄（⋮⋮）调整排列顺序，勾选框控制显示/隐藏。
        </p>
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
        <div className="settings-server-info">
          <div className="server-info-row">
            <span className="server-info-label">服务器</span>
            <span className="server-info-value">{SERVER_URL}</span>
          </div>
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
