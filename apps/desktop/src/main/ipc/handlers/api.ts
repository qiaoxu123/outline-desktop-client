import { ipcMain } from "electron";
import { z } from "zod";
import { findProfile } from "../../services/storage/profiles";
import { apiRequest, classifyError } from "@outline/api-client";

function ok<T>(data: T) {
  return { ok: true as const, data };
}

function fail(code: string, message: string, retryable = false) {
  return { ok: false as const, error: { code, message, retryable } };
}

/**
 * Generic, whitelisted pass-through to the Outline API so each new endpoint
 * doesn't need its own bespoke handler. The renderer can only call methods
 * listed here; the API key never leaves the main process.
 */
const ALLOWED_METHODS = new Set([
  "auth.info",
  // stars
  "stars.list",
  "stars.create",
  "stars.delete",
  // shares
  "shares.list",
  // documents
  "documents.viewed",
  "documents.list",
  "documents.recently_viewed",
  "documents.drafts",
  "documents.create",
  "documents.update",
  "documents.duplicate",
  "documents.archive",
  "documents.delete",
  "documents.restore",
  // revisions (history)
  "revisions.list",
  "revisions.info",
  // comments
  "comments.list",
  "comments.create",
  "comments.delete",
  "comments.resolve",
  "comments.unresolve",
  // views / presence
  "views.list",
  "views.create",
  // collections
  "collections.info",
  "collections.create",
]);

const CallSchema = z.object({
  profileId: z.string().min(1),
  method: z.string().min(1),
  params: z.record(z.unknown()).optional(),
});

export function registerApiHandlers(): void {
  ipcMain.handle("api:call", async (_event, payload: unknown) => {
    const parsed = CallSchema.safeParse(payload);
    if (!parsed.success) {
      return fail("VALIDATION", "profileId and method required");
    }

    const { profileId, method, params } = parsed.data;

    if (!ALLOWED_METHODS.has(method)) {
      return fail("FORBIDDEN", `API method not allowed: ${method}`);
    }

    const profile = findProfile(profileId);
    if (!profile) return fail("NOT_FOUND", "Profile not found");

    try {
      const result = await apiRequest(
        { baseUrl: profile.serverUrl, token: profile.apiKey },
        method,
        params ?? {},
      );
      return ok(result);
    } catch (err) {
      const apiErr = classifyError(err);
      return fail(apiErr.code, apiErr.message, apiErr.retryable);
    }
  });
}
