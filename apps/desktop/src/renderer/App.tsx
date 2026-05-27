import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import CollectionsView from "./features/collections/CollectionsView";
import DocumentView from "./features/documents/DocumentView";
import SearchView from "./features/search/SearchView";
import SettingsView from "./features/profiles/SettingsView";
import { useUIStore, useProfileStore } from "./state/uiStore";
import { useElectronAPI } from "./hooks/useElectronAPI";
import { useEffect, useState } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function AppInit({ children }: { children: React.ReactNode }): React.ReactElement {
  const api = useElectronAPI();
  const setProfiles = useProfileStore((s) => s.setProfiles);
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const setActiveProfileId = useUIStore((s) => s.setActiveProfileId);
  const [init, setInit] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.profiles.list().then((result) => {
      const r = result as {
        ok: boolean;
        data?: { id: string; name: string; serverUrl: string; createdAt: string }[];
        error?: { message: string };
      };
      if (r.ok && r.data && r.data.length > 0) {
        setProfiles(r.data);
        setActiveProfileId(r.data[0].id);
      } else {
        setError(r.error?.message || "No workspace configured");
      }
      setInit(true);
    });
  }, []);

  if (!init) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        color: "#6c757d",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 32, height: 32,
            border: "3px solid #e9ecef",
            borderTopColor: "#4c6ef5",
            borderRadius: "50%",
            animation: "spin 0.6s linear infinite",
            margin: "0 auto 16px",
          }} />
          <p>Connecting to Outline…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!activeProfileId) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      }}>
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <h2 style={{ marginBottom: 8 }}>Connection Error</h2>
          <p style={{ color: "#e03131", marginBottom: 16 }}>{error}</p>
          <p style={{ color: "#6c757d", fontSize: 14 }}>
            Make sure the proxy is running at 127.0.0.1:7897 and the Outline
            server is accessible.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function App(): React.ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <AppInit>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<CollectionsView />} />
              <Route
                path="/collection/:collectionId"
                element={<CollectionsView />}
              />
              <Route path="/document/:documentId" element={<DocumentView />} />
              <Route path="/search" element={<SearchView />} />
              <Route path="/settings" element={<SettingsView />} />
            </Route>
          </Routes>
        </AppInit>
      </HashRouter>
    </QueryClientProvider>
  );
}
