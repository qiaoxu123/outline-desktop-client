import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import CollectionsView from "./features/collections/CollectionsView";
import DocumentView from "./features/documents/DocumentView";
import SearchView from "./features/search/SearchView";
import SettingsView from "./features/profiles/SettingsView";
import LoginScreen from "./features/auth/LoginScreen";
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.profiles.list().then((result) => {
      const r = result as {
        ok: boolean;
        data?: { id: string; name: string; serverUrl: string; createdAt: string }[];
      };
      if (r.ok && r.data && r.data.length > 0) {
        setProfiles(r.data);
        setActiveProfileId(r.data[0].id);
      }
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        color: "#6c757d", background: "#f5f7fa",
      }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!activeProfileId) {
    return <LoginScreen />;
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
              <Route path="/collection/:collectionId" element={<CollectionsView />} />
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
