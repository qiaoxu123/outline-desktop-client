export interface OutlineProfile {
  id: string;
  name: string;
  serverUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface OutlineCollection {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  documentCount: number;
  sort: { field: string; direction: "asc" | "desc" };
  createdAt: string;
  updatedAt: string;
}

export interface OutlineDocument {
  id: string;
  title: string;
  text: string;
  urlId: string;
  collectionId: string;
  parentDocumentId: string | null;
  fullWidth: boolean;
  emoji: string | null;
  isStarred: boolean;
  pinned: boolean | null;
  templateId: string | null;
  publishedAt: string | null;
  revision: number;
  createdBy: { id: string; name: string; avatarUrl: string | null };
  updatedBy: { id: string; name: string; avatarUrl: string | null };
  collaboratorIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface OutlineCollectionDocument {
  id: string;
  title: string;
  urlId: string;
  emoji: string | null;
  children: OutlineCollectionDocument[];
}

export interface OutlineSearchResult {
  id: string;
  title: string;
  text: string;
  urlId: string;
  collectionId: string;
  createdBy: { id: string; name: string; avatarUrl: string | null };
  updatedBy: { id: string; name: string; avatarUrl: string | null };
  createdAt: string;
  updatedAt: string;
  documentId?: string;
  context?: string;
  ranking?: number;
  score?: number;
}

export interface OutlineAttachment {
  id: string;
  name: string;
  size: number;
  contentType: string;
  url: string;
  documentId: string | null;
  createdBy: { id: string; name: string; avatarUrl: string | null };
  createdAt: string;
  updatedAt: string;
}

export interface PaginationParams {
  offset?: number;
  limit?: number;
  sort?: string;
  direction?: "asc" | "desc";
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    offset: number;
    limit: number;
    total: number;
  };
}
