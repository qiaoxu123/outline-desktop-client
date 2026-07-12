import { useProfileStore, useUIStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import {
  useUserInfo,
  absoluteUrl,
  roleLabel,
  canUserEdit,
} from "../../hooks/useOutline";
import pkg from "../../../../package.json";
import "./SettingsView.css";

const SERVER_URL = "https://notes.jlu-mcns.site";

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
  const fullWidth = useUIStore((s) => s.fullWidth);
  // The titlebar 全宽 toggle displays as level 5 here — highlighting the
  // stored level while full width is active would misstate what's on screen.
  const effectiveWidth = fullWidth ? 5 : contentWidth;

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

  const handleLogout = async () => {
    if (activeProfileId) {
      // Delete from disk too — otherwise the profile resurrects on restart
      // and the login screen never shows again.
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
              className={`settings-theme-option ${effectiveWidth === opt.value ? "active" : ""}`}
              onClick={() => setContentWidth(opt.value)}
            >
              {opt.label}
            </button>
          ))}
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
