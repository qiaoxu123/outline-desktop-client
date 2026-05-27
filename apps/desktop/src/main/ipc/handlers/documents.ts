import { ipcMain } from "electron";
import { z } from "zod";
import { findProfile } from "../../services/storage/profiles";
import { getDocument, listDocuments, searchDocuments, createDocument, updateDocument, deleteDocument } from "@outline/api-client";
import { classifyError } from "@outline/api-client";

function ok<T>(data: T) {
  return { ok: true as const, data };
}

function fail(code: string, message: string, retryable = false) {
  return { ok: false as const, error: { code, message, retryable } };
}

const DocumentPayloadSchema = z.object({
  profileId: z.string().min(1),
  documentId: z.string().min(1),
});

const ListDocumentsSchema = z.object({
  profileId: z.string().min(1),
  collectionId: z.string().optional(),
  parentDocumentId: z.string().optional(),
  offset: z.number().optional(),
  limit: z.number().optional(),
  sort: z.string().optional(),
  direction: z.enum(["asc", "desc"]).optional(),
});

const SearchSchema = z.object({
  profileId: z.string().min(1),
  query: z.string().min(1),
  collectionId: z.string().optional(),
  offset: z.number().optional(),
  limit: z.number().optional(),
});

const CreateDocumentSchema = z.object({
  profileId: z.string().min(1),
  title: z.string().min(1),
  text: z.string().default(""),
  collectionId: z.string().min(1),
  parentDocumentId: z.string().optional(),
  publish: z.boolean().optional(),
});

const UpdateDocumentSchema = z.object({
  profileId: z.string().min(1),
  id: z.string().min(1),
  title: z.string().optional(),
  text: z.string().optional(),
  append: z.boolean().optional(),
  publish: z.boolean().optional(),
});

export function registerDocumentHandlers(): void {
  ipcMain.handle("documents:info", async (_event, payload: unknown) => {
    const parsed = DocumentPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return fail("VALIDATION", "profileId and documentId required");
    }

    try {
      const profile = findProfile(parsed.data.profileId);
      if (!profile) return fail("NOT_FOUND", "Profile not found");

      const result = await getDocument(
        { baseUrl: profile.serverUrl, token: profile.apiKey },
        parsed.data.documentId,
      );
      return ok(result);
    } catch (err) {
      const apiErr = classifyError(err);
      return fail(apiErr.code, apiErr.message, apiErr.retryable);
    }
  });

  ipcMain.handle("documents:list", async (_event, payload: unknown) => {
    const parsed = ListDocumentsSchema.safeParse(payload);
    if (!parsed.success) {
      return fail("VALIDATION", parsed.error.issues.map((i) => i.message).join(", "));
    }

    try {
      const profile = findProfile(parsed.data.profileId);
      if (!profile) return fail("NOT_FOUND", "Profile not found");

      const result = await listDocuments(
        { baseUrl: profile.serverUrl, token: profile.apiKey },
        parsed.data,
      );
      return ok(result);
    } catch (err) {
      const apiErr = classifyError(err);
      return fail(apiErr.code, apiErr.message, apiErr.retryable);
    }
  });

  ipcMain.handle("documents:search", async (_event, payload: unknown) => {
    const parsed = SearchSchema.safeParse(payload);
    if (!parsed.success) {
      return fail("VALIDATION", "profileId and query required");
    }

    try {
      const profile = findProfile(parsed.data.profileId);
      if (!profile) return fail("NOT_FOUND", "Profile not found");

      const result = await searchDocuments(
        { baseUrl: profile.serverUrl, token: profile.apiKey },
        parsed.data,
      );
      return ok(result);
    } catch (err) {
      const apiErr = classifyError(err);
      return fail(apiErr.code, apiErr.message, apiErr.retryable);
    }
  });

  ipcMain.handle("documents:create", async (_event, payload: unknown) => {
    const parsed = CreateDocumentSchema.safeParse(payload);
    if (!parsed.success) {
      return fail("VALIDATION", parsed.error.issues.map((i) => i.message).join(", "));
    }

    try {
      const profile = findProfile(parsed.data.profileId);
      if (!profile) return fail("NOT_FOUND", "Profile not found");

      const result = await createDocument(
        { baseUrl: profile.serverUrl, token: profile.apiKey },
        parsed.data,
      );
      return ok(result);
    } catch (err) {
      const apiErr = classifyError(err);
      return fail(apiErr.code, apiErr.message, apiErr.retryable);
    }
  });

  ipcMain.handle("documents:update", async (_event, payload: unknown) => {
    const parsed = UpdateDocumentSchema.safeParse(payload);
    if (!parsed.success) {
      return fail("VALIDATION", parsed.error.issues.map((i) => i.message).join(", "));
    }

    try {
      const profile = findProfile(parsed.data.profileId);
      if (!profile) return fail("NOT_FOUND", "Profile not found");

      const result = await updateDocument(
        { baseUrl: profile.serverUrl, token: profile.apiKey },
        parsed.data,
      );
      return ok(result);
    } catch (err) {
      const apiErr = classifyError(err);
      return fail(apiErr.code, apiErr.message, apiErr.retryable);
    }
  });

  ipcMain.handle("documents:delete", async (_event, payload: unknown) => {
    const parsed = DocumentPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return fail("VALIDATION", "profileId and documentId required");
    }

    try {
      const profile = findProfile(parsed.data.profileId);
      if (!profile) return fail("NOT_FOUND", "Profile not found");

      await deleteDocument(
        { baseUrl: profile.serverUrl, token: profile.apiKey },
        parsed.data.documentId,
      );
      return ok({ deleted: true });
    } catch (err) {
      const apiErr = classifyError(err);
      return fail(apiErr.code, apiErr.message, apiErr.retryable);
    }
  });
}
