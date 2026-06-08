import { useProfileStore, useUIStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import "./SettingsView.css";

const SERVER_URL = "https://notes.jlu-mcns.site";

export default function SettingsView(): React.ReactElement {
  const api = useElectronAPI();
  const profiles = useProfileStore((s) => s.profiles);
  const removeProfile = useProfileStore((s) => s.removeProfile);
  const setActiveProfileId = useUIStore((s) => s.setActiveProfileId);
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const activeProfile = profiles.find((p) => p.id === activeProfileId);

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
      <h2 className="settings-title">Settings</h2>

      <section className="settings-section">
        <h3>Workspace</h3>
        <div className="settings-server-info">
          <div className="server-info-row">
            <span className="server-info-label">Server</span>
            <span className="server-info-value">{SERVER_URL}</span>
          </div>
          {activeProfile && (
            <div className="server-info-row">
              <span className="server-info-label">Connected as</span>
              <span className="server-info-value">{activeProfile.name}</span>
            </div>
          )}
        </div>

        <button className="logout-button" onClick={handleLogout}>
          Disconnect & Logout
        </button>
      </section>

      <section className="settings-section">
        <h3>About</h3>
        <p className="settings-description">
          Outline Desktop v0.1.0 — macOS
        </p>
      </section>
    </div>
  );
}
