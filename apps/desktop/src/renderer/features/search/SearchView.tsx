import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUIStore } from "../../state/uiStore";
import "./SearchView.css";

export default function SearchView(): React.ReactElement {
  const navigate = useNavigate();
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const [query, setQuery] = useState("");

  if (!activeProfileId) {
    return (
      <div className="search-empty">
        <h2>Search</h2>
        <p>Select a workspace before searching.</p>
      </div>
    );
  }

  return (
    <div className="search-view">
      <div className="search-input-container">
        <svg
          className="search-input-icon"
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
          placeholder="Search documents across all collections…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>
      {!query && (
        <div className="search-placeholder">
          <p>Enter a query to search your Outline knowledge base</p>
          <p className="search-hint">
            Search is powered by Outline&rsquo;s built-in full-text search
          </p>
        </div>
      )}
      {query && (
        <div className="search-results-placeholder">
          <p>
            Search for &ldquo;{query}&rdquo; will be available after wiring the
            full API integration.
          </p>
        </div>
      )}
    </div>
  );
}
