import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import CollectionsView from "./features/collections/CollectionsView";
import DocumentView from "./features/documents/DocumentView";
import SearchView from "./features/search/SearchView";
import SettingsView from "./features/profiles/SettingsView";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export default function App(): React.ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<CollectionsView />} />
            <Route path="/collection/:collectionId" element={<CollectionsView />} />
            <Route path="/document/:documentId" element={<DocumentView />} />
            <Route path="/search" element={<SearchView />} />
            <Route path="/settings" element={<SettingsView />} />
          </Route>
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  );
}
