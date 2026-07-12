import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import CollectionsView from "./features/collections/CollectionsView";
import DocumentView from "./features/documents/DocumentView";
import HomeView from "./features/home/HomeView";
import SharesView from "./features/shares/SharesView";
import SearchView from "./features/search/SearchView";
import SettingsView from "./features/profiles/SettingsView";
import LoginScreen from "./features/auth/LoginScreen";
import { useUIStore, useProfileStore } from "./state/uiStore";
import { useElectronAPI } from "./hooks/useElectronAPI";
import { Component, useEffect, useState, type ReactNode } from "react";

/**
 * Without a boundary, any render error unmounts the entire React tree and
 * leaves a silent white window. Show the error instead.
 */
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error("[renderer] render crash:", error);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            gap: "12px",
            fontFamily: "var(--font-sans)",
            color: "#495057",
            background: "#f5f7fa",
            padding: "40px",
            textAlign: "center",
          }}
        >
          <h2 style={{ color: "#e03131" }}>界面渲染出错</h2>
          <pre
            style={{
              fontSize: "12px",
              color: "#868e96",
              whiteSpace: "pre-wrap",
              maxWidth: "600px",
            }}
          >
            {String(this.state.error)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 24px",
              border: "none",
              borderRadius: "8px",
              background: "#4c6ef5",
              color: "white",
              cursor: "pointer",
            }}
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  const [loginNotice, setLoginNotice] = useState("");

  useEffect(() => {
    const init = async () => {
      const r = (await api.profiles.list()) as {
        ok: boolean;
        data?: { id: string; name: string; serverUrl: string; createdAt: string }[];
      };

      if (!r.ok || !r.data || r.data.length === 0) {
        setLoading(false);
        return;
      }

      // Validate the stored session before entering the app — stale or
      // pre-seeded tokens otherwise skip the login screen forever.
      const profile = r.data[0];
      const v = (await api.profiles.verify(profile.id)) as {
        ok: boolean;
        data?: { valid: boolean; reason?: string };
      };

      if (v.ok && v.data && !v.data.valid && v.data.reason === "auth") {
        // Token expired/revoked: drop the profile and show the login screen
        await api.profiles.delete(profile.id);
        setLoginNotice("登录已过期，请重新登录。");
        setLoading(false);
        return;
      }

      // Valid token (or server temporarily unreachable): enter the app
      setProfiles(r.data);
      setActiveProfileId(profile.id);
      setLoading(false);
    };

    void init();
  }, []);

  if (loading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", fontFamily: "var(--font-sans)",
        color: "#6c757d", background: "#f5f7fa",
      }}>
        正在连接 JLUMCNS-MEC…
      </div>
    );
  }

  if (!activeProfileId) {
    return <LoginScreen notice={loginNotice} />;
  }

  return <>{children}</>;
}

/** Applies the chosen theme to <html data-theme>, following the OS in "system". */
function useApplyTheme(): void {
  const theme = useUIStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      root.setAttribute("data-theme", dark ? "dark" : "light");
    };

    apply();
    if (theme === "system") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);
}

export default function App(): React.ReactElement {
  useApplyTheme();
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
        <AppInit>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomeView />} />
              <Route path="/collection/:collectionId" element={<CollectionsView />} />
              <Route path="/document/:documentId" element={<DocumentView />} />
              <Route path="/shares" element={<SharesView />} />
              {/* content rendered by the persistent ForumPane in AppShell */}
              <Route path="/forum" element={<></>} />
              <Route path="/search" element={<SearchView />} />
              <Route path="/settings" element={<SettingsView />} />
            </Route>
          </Routes>
        </AppInit>
        </HashRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
