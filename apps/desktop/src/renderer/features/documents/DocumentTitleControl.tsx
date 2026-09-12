import type { ChangeEvent, KeyboardEvent } from "react";

interface DocumentTitleControlProps {
  title: string;
  editing: boolean;
  onStartEditing: () => void;
  onChange: (title: string) => void;
  onCommit: () => void;
}

/**
 * Keeps the document title visibly read-only until the user explicitly starts
 * editing it. This makes the title action discoverable while retaining the
 * direct click-to-edit interaction.
 */
export function DocumentTitleControl({
  title,
  editing,
  onStartEditing,
  onChange,
  onCommit,
}: DocumentTitleControlProps): React.ReactElement {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || ((event.metaKey || event.ctrlKey) && event.key === "s")) {
      event.preventDefault();
      // Let the shared blur handler perform the single save. Calling onCommit
      // here as well would submit twice when React unmounts the input.
      event.currentTarget.blur();
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        className="document-title-input"
        aria-label="文档标题"
        value={title}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onCommit}
        placeholder="无标题"
      />
    );
  }

  return (
    <h1 className="document-title-control">
      <button
        type="button"
        className="document-title-trigger"
        aria-label="编辑文档标题"
        onClick={onStartEditing}
      >
        {title || "无标题"}
      </button>
      <button
        type="button"
        className="document-title-edit-button"
        aria-label="编辑文档标题"
        onClick={onStartEditing}
      >
        ✎
      </button>
    </h1>
  );
}
