import { useMemo } from "react";
import NotesRail from "../../features/notes/NotesRail";
import { useNotes } from "../../features/notes/useNotes";
import {
  dayCounts,
  computeStreak,
  todayKey,
} from "../../features/notes/noteUtils";

/**
 * Wraps NotesRail as a full-height sidebar panel so AppShell can render it
 * in place of the default collections sidebar when /notes is active.
 *
 * Filter state (tag, day, search) is managed by NotesView via URL or shared
 * state. For now, NotesSidebar shows stats/heatmap/tags but does not apply
 * filters — NotesRail's tag/day click callbacks are passed as no-ops.
 */
export default function NotesSidebar({
  activeTag,
  selectedDay,
  onSelectTag,
  onSelectDay,
  onClearTag,
}: {
  activeTag: string | null;
  selectedDay: string | null;
  onSelectTag: (tag: string) => void;
  onSelectDay: (day: string | null) => void;
  onClearTag: () => void;
}): React.ReactElement {
  const n = useNotes();
  const counts = useMemo(() => dayCounts(n.liveNotes), [n.liveNotes]);
  const allTags = useMemo(() => {
    const m = new Map<string, number>();
    for (const note of n.liveNotes)
      for (const t of note.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [n.liveNotes]);
  const streak = useMemo(
    () => computeStreak(new Set(counts.keys()), todayKey()),
    [counts],
  );

  return (
    <NotesRail
      noteCount={n.liveNotes.length}
      tagCount={allTags.length}
      activeDays={counts.size}
      streak={streak}
      counts={counts}
      selectedDay={selectedDay}
      onSelectDay={onSelectDay}
      tags={allTags}
      activeTag={activeTag}
      onSelectTag={onSelectTag}
      onClearTag={onClearTag}
    />
  );
}
