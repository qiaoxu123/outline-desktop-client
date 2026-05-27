import { useState } from "react";
import { useProfileStore, useUIStore, type ProfileRecord } from "../../state/uiStore";
import "./SettingsView.css";

export default function SettingsView(): React.ReactElement {
  const profiles = useProfileStore((s) => s.profiles);
  const addProfile = useProfileStore((s) => s.addProfile);
  const removeProfile = useProfileStore((s) => s.removeProfile);
  const updateProfile = useProfileStore((s) => s.updateProfile);
  const setActiveProfileId = useUIStore((s) => s.setActiveProfileId);

  const [name, setName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");

  const handleAdd = () => {
    setError("");
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!serverUrl.trim()) {
      setError("Server URL is required");
      return;
    }
    if (!apiKey.trim()) {
      setError("API key is required");
      return;
    }

    const id = crypto.randomUUID();
    addProfile({
      id,
      name: name.trim(),
      serverUrl: serverUrl.trim().replace(/\/+$/, ""),
      createdAt: new Date().toISOString(),
    });
    setActiveProfileId(id);
    setName("");
    setServerUrl("");
    setApiKey("");
  };

  return (
    <div className="settings-view">
      <h2 className="settings-title">Settings</h2>

      <section className="settings-section">
        <h3>Workspaces</h3>
        <p className="settings-description">
          Connect to one or more Outline servers. Your API key is stored
          securely in the system keychain.
        </p>

        <div className="profiles-list">
          {profiles.length === 0 && (
            <p className="profiles-empty">No workspaces configured yet.</p>
          )}
          {profiles.map((p: ProfileRecord) => (
            <div key={p.id} className="profile-card">
              <div className="profile-card-info">
                <strong>{p.name}</strong>
                <span className="profile-card-url">{p.serverUrl}</span>
              </div>
              <button
                className="profile-card-remove"
                onClick={() => {
                  removeProfile(p.id);
                  if (useUIStore.getState().activeProfileId === p.id) {
                    setActiveProfileId(null);
                  }
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="add-profile-form">
          <h4>Add Workspace</h4>
          <div className="form-field">
            <label htmlFor="profile-name">Display Name</label>
            <input
              id="profile-name"
              type="text"
              placeholder="My Workspace"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="profile-url">Server URL</label>
            <input
              id="profile-url"
              type="text"
              placeholder="https://docs.example.com"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="profile-key">API Key</label>
            <input
              id="profile-key"
              type="password"
              placeholder="ol_api_..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          {error && <p className="form-error">{error}</p>}
          <button className="form-submit" onClick={handleAdd}>
            Connect Workspace
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3>About</h3>
        <p className="settings-description">
          Outline Desktop v0.1.0 — macOS Preview
        </p>
      </section>
    </div>
  );
}
