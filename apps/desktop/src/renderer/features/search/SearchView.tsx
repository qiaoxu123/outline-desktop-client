import { useState } from "react";
import { useUIStore } from "../../state/uiStore";
import { useElectronAPI } from "../../hooks/useElectronAPI";
import "./SearchView.css";

export default function SearchView(): React.ReactElement {
  const api = useElectronAPI();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; title: string; context?: string; collectionId: string }[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (!query.trim() || !activeProfileId) return;
    setSearching(true);
    try {
      // The search IPC is not wired yet, show hint for now
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="search-view">
      <div className="search-header">
        <div className="search-input-wrapper">
          <svg
            className="search-icon"
            width="18"
            height="18"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.975 1.975 0 00-.017.016zm-5.242.156a5 5 0 110-10 5 5 0 010 10z" />
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder='Search documents... (e.g. "reinforcement learning")'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            autoFocus
          />
        </div>
      </div>

      {!query && (
        <div className="search-empty">
          <p>Search across all collections in your knowledge base</p>
          <p className="search-hint">
            Full-text search powered by Outline
          </p>
        </div>
      )}
      {query && !searching && results.length === 0 && (
        <div className="search-empty">
          <p>Search will be available after completing API integration</p>
        </div>
      )}
    </div>
  );
}
