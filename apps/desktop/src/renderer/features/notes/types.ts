export const NOTES_VERSION = 1;

export interface NoteLink {
  docId: string;
  urlId?: string;
  title: string;
}

export interface Note {
  id: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  deletedAt: string | null;
  links: NoteLink[];
}

export interface NotesFile {
  version: number;
  notes: Note[];
}

/** Per-user private file under the shared WebDAV root (5-共享/Outline桌面端). */
export function notesFilePath(userId: string): string {
  return `随记/${userId}.json`;
}

/** localStorage mirror key for instant paint before WebDAV hydrates. */
export function cacheKey(userId: string): string {
  return `notes.cache.${userId}.v1`;
}
