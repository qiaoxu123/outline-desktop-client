import { useQuery } from "@tanstack/react-query";
import { useProfileStore, useUIStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import { unwrapIpc } from "../../lib/ipc";
import "./SettingsView.css";

const SERVER_URL = "https://notes.jlu-mcns.site";

interface AuthInfoResponse {
  data: {
    user?: {
      id: string;
      name: string;
      email?: string;
      avatarUrl?: string | null;
      role?: string;
      createdAt?: string;
      lastActiveAt?: string;
    };
    team?: {
      id: string;
      name: string;
      avatarUrl?: string | null;
    };
  };
}

export default function SettingsView(): React.ReactElement {
  const api = useElectronAPI();
  const profiles = useProfileStore((s) => s.profiles);
  const removeProfile = useProfileStore((s) => s.removeProfile);
  const setActiveProfileId = useUIStore((s) => s.setActiveProfileId);
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", activeProfileId, "userInfo"],
    queryFn: () =>
      unwrapIpc<AuthInfoResponse>(api.profiles.userInfo(activeProfileId!)),
    enabled: !!activeProfileId,
  });

  const user = data?.data?.user;
  const team = data?.data?.team;

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
            无法加载用户信息
          </p>
        )}
        {user && (
          <div className="settings-user-card">
            {user.avatarUrl ? (
              <img
                className="settings-avatar"
                src={user.avatarUrl}
                alt={user.name}
              />
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
              {user.role && (
                <span className="settings-user-role">{user.role}</span>
              )}
            </div>
          </div>
        )}
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
          Outline Desktop v0.1 — macOS / Windows / Linux
        </p>
      </section>
    </div>
  );
}
