export type OutlineMethod =
  | "collections.list"
  | "collections.info"
  | "collections.documents"
  | "documents.list"
  | "documents.info"
  | "documents.search"
  | "documents.create"
  | "documents.update"
  | "documents.delete"
  | "attachments.list"
  | "attachments.create";

export interface ApiRequestOptions {
  method: OutlineMethod;
  params: Record<string, unknown>;
  baseUrl: string;
  token: string;
  signal?: AbortSignal;
}
