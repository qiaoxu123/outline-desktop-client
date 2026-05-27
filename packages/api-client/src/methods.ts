import type {
  OutlineCollection,
  OutlineDocument,
  OutlineCollectionDocument,
  OutlineSearchResult,
  OutlineAttachment,
  PaginatedResponse,
} from "@outline/shared-types";
import { apiRequest, type TransportConfig } from "./transport";

export async function listCollections(
  config: TransportConfig,
  params?: { offset?: number; limit?: number; statusFilter?: string },
): Promise<PaginatedResponse<OutlineCollection>> {
  return apiRequest<PaginatedResponse<OutlineCollection>>(
    config,
    "collections.list",
    params ?? {},
  );
}

export async function getCollection(
  config: TransportConfig,
  id: string,
): Promise<{ data: OutlineCollection }> {
  return apiRequest<{ data: OutlineCollection }>(config, "collections.info", {
    id,
  });
}

export async function getCollectionDocuments(
  config: TransportConfig,
  id: string,
): Promise<{ data: OutlineCollectionDocument[] }> {
  return apiRequest<{ data: OutlineCollectionDocument[] }>(
    config,
    "collections.documents",
    { id },
  );
}

export async function listDocuments(
  config: TransportConfig,
  params: {
    collectionId?: string;
    parentDocumentId?: string;
    offset?: number;
    limit?: number;
    sort?: string;
    direction?: "asc" | "desc";
    statusFilter?: string;
  },
): Promise<PaginatedResponse<OutlineDocument>> {
  return apiRequest<PaginatedResponse<OutlineDocument>>(
    config,
    "documents.list",
    params,
  );
}

export async function getDocument(
  config: TransportConfig,
  id: string,
): Promise<{ data: OutlineDocument }> {
  return apiRequest<{ data: OutlineDocument }>(config, "documents.info", {
    id,
  });
}

export async function searchDocuments(
  config: TransportConfig,
  params: {
    query: string;
    collectionId?: string;
    offset?: number;
    limit?: number;
    statusFilter?: string;
  },
): Promise<PaginatedResponse<OutlineSearchResult>> {
  return apiRequest<PaginatedResponse<OutlineSearchResult>>(
    config,
    "documents.search",
    params,
  );
}

export async function createDocument(
  config: TransportConfig,
  params: {
    title: string;
    text: string;
    collectionId: string;
    parentDocumentId?: string;
    publish?: boolean;
  },
): Promise<{ data: OutlineDocument }> {
  return apiRequest<{ data: OutlineDocument }>(config, "documents.create", {
    ...params,
    publish: params.publish ?? true,
  });
}

export async function updateDocument(
  config: TransportConfig,
  params: {
    id: string;
    title?: string;
    text?: string;
    append?: boolean;
    publish?: boolean;
  },
): Promise<{ data: OutlineDocument }> {
  return apiRequest<{ data: OutlineDocument }>(config, "documents.update", {
    ...params,
    publish: params.publish ?? true,
  });
}

export async function deleteDocument(
  config: TransportConfig,
  id: string,
): Promise<void> {
  await apiRequest(config, "documents.delete", { id });
}

export async function listAttachments(
  config: TransportConfig,
  params?: { documentId?: string; offset?: number; limit?: number },
): Promise<PaginatedResponse<OutlineAttachment>> {
  return apiRequest<PaginatedResponse<OutlineAttachment>>(
    config,
    "attachments.list",
    params ?? {},
  );
}

export async function createAttachment(
  config: TransportConfig,
  formData: FormData,
): Promise<{ data: OutlineAttachment }> {
  const url = config.baseUrl.replace(/\/+$/, "") + "/api/attachments.create";
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}` },
    body: formData,
  });
  return response.json();
}
