import { useState } from "react";
import { useProfileStore, useUIStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import "./LoginScreen.css";

const SERVER_NAME = "JLUMCNS-MEC";
const SERVER_URL = "https://notes.jlu-mcns.site";

export default function LoginScreen(): React.ReactElement {
  const api = useElectronAPI();
  const addProfile = useProfileStore((s) => s.addProfile);
  const setActiveProfileId = useUIStore((s) => s.setActiveProfileId);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  const handleBrowserLogin = async () => {
    setConnecting(true);
    setError("");

    try {
      const result = (await api.auth.loginWithBrowser()) as {
        ok: boolean;
        data?: { token: string; cookieName: string };
        error?: { message: string };
      };

      if (result.ok && result.data?.token) {
        const createResult = (await api.profiles.create({
          name: SERVER_NAME,
          serverUrl: SERVER_URL,
          apiKey: result.data.token,
        })) as { ok: boolean; data?: { id: string }; error?: { message: string } };

        if (createResult.ok && createResult.data) {
          addProfile({
            id: createResult.data.id,
            name: SERVER_NAME,
            serverUrl: SERVER_URL,
            createdAt: new Date().toISOString(),
          });
          setActiveProfileId(createResult.data.id);
        } else {
          setError(createResult.error?.message || "Failed to save login");
        }
      } else {
        setError(result.error?.message || "Login failed. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="12" fill="#4c6ef5" />
            <path d="M14 16h20v2H14v-2zm0 6h20v2H14v-2zm0 6h14v2H14v-2z" fill="white" />
          </svg>
        </div>

        <h1 className="login-title">Outline Desktop</h1>
        <p className="login-subtitle">JLUMCNS-MEC 知识库</p>

        <div className="login-server-badge">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.5 5h-1.687a5.993 5.993 0 00-1.22-3.368A5.508 5.508 0 0111.5 6zm-7 0h1.687a5.993 5.993 0 011.22-3.368A5.508 5.508 0 014.5 6zM8 2.158A4.508 4.508 0 019.198 4.5H6.802A4.508 4.508 0 018 2.158zM2.5 8a5.5 5.5 0 01.743-2.75h1.883A6.46 6.46 0 004.77 7.5H2.806c-.2.323-.306.68-.306 1.05 0 .37.107.727.306 1.05H4.77a6.46 6.46 0 00.356 2.25H3.243A5.5 5.5 0 012.5 8zm6.5 5.842A4.508 4.508 0 017.802 13h.396A4.508 4.508 0 019.198 13.842zM10.374 13a5.993 5.993 0 001.252-3.5H13.5a5.508 5.508 0 01-3.126 3.5zM13.694 8h-1.968a6.46 6.46 0 00-.356-2.25h1.883A5.5 5.5 0 0113.5 8c0 .08-.003.16-.006.24-.064-.14-.13-.24-.2-.24h.4z" />
          </svg>
          <span>{SERVER_URL}</span>
        </div>

        <div className="login-form">
          <p className="login-description">
            Sign in using your web browser, just like the Outline website.
          </p>

          {error && <p className="login-error">{error}</p>}

          <button
            className="login-button"
            onClick={handleBrowserLogin}
            disabled={connecting}
          >
            {connecting ? (
              <>
                <span className="login-spinner" />
                Waiting for login…
              </>
            ) : (
              "Sign in with Browser"
            )}
          </button>

          <p className="login-hint">
            A browser window will open. Sign in with your email and the window
            will close automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
