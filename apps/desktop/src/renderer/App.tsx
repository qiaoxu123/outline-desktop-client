import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import CollectionsView from "./features/collections/CollectionsView";
import DocumentView from "./features/documents/DocumentView";
import SearchView from "./features/search/SearchView";
import SettingsView from "./features/profiles/SettingsView";
import LoginScreen from "./features/auth/LoginScreen";
import { useUIStore } from "./state/uiStore";
import { useAppInit } from "./hooks/useAppInit";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function AppRoutes(): React.ReactElement {
  useAppInit();
  const activeProfileId = useUIStore((s) => s.activeProfileId);

  if (!activeProfileId) {
    return <LoginScreen />;
  }

  return (
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
  );
}

export default function App(): React.ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </QueryClientProvider>
  );
}
