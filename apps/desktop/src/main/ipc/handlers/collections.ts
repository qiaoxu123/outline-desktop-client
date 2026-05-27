import { ipcMain } from "electron";
import { z } from "zod";
import { findProfile } from "../../services/storage/profiles";
import {
  listCollections,
  getCollection,
  getCollectionDocuments,
} from "@outline/api-client";
import { classifyError } from "@outline/api-client";

function ok<T>(data: T) {
  return { ok: true as const, data };
}

function fail(code: string, message: string, retryable = false) {
  return { ok: false as const, error: { code, message, retryable } };
}

const ProfilePayloadSchema = z.object({
  profileId: z.string().min(1),
});

const CollectionPayloadSchema = z.object({
  profileId: z.string().min(1),
  collectionId: z.string().min(1),
});

export function registerCollectionHandlers(): void {
  ipcMain.handle("collections:list", async (_event, payload: unknown) => {
    const parsed = ProfilePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return fail("VALIDATION", "profileId required");
    }

    try {
      const profile = findProfile(parsed.data.profileId);
      if (!profile) return fail("NOT_FOUND", "Profile not found");

      const result = await listCollections(
        { baseUrl: profile.serverUrl, token: profile.apiKey },
        { limit: 100 },
      );
      return ok(result);
    } catch (err) {
      const apiErr = classifyError(err);
      return fail(apiErr.code, apiErr.message, apiErr.retryable);
    }
  });

  ipcMain.handle("collections:info", async (_event, payload: unknown) => {
    const parsed = CollectionPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return fail("VALIDATION", "profileId and collectionId required");
    }

    try {
      const profile = findProfile(parsed.data.profileId);
      if (!profile) return fail("NOT_FOUND", "Profile not found");

      const result = await getCollection(
        { baseUrl: profile.serverUrl, token: profile.apiKey },
        parsed.data.collectionId,
      );
      return ok(result);
    } catch (err) {
      const apiErr = classifyError(err);
      return fail(apiErr.code, apiErr.message, apiErr.retryable);
    }
  });

  ipcMain.handle("collections:documents", async (_event, payload: unknown) => {
    const parsed = CollectionPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return fail("VALIDATION", "profileId and collectionId required");
    }

    try {
      const profile = findProfile(parsed.data.profileId);
      if (!profile) return fail("NOT_FOUND", "Profile not found");

      const result = await getCollectionDocuments(
        { baseUrl: profile.serverUrl, token: profile.apiKey },
        parsed.data.collectionId,
      );
      return ok(result);
    } catch (err) {
      const apiErr = classifyError(err);
      return fail(apiErr.code, apiErr.message, apiErr.retryable);
    }
  });
}
