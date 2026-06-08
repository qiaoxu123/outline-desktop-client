import { ipcMain } from "electron";
import { z } from "zod";
import { readProfiles, writeProfiles, type StoredProfile } from "../../services/storage/profiles";
import { apiRequest, AuthError } from "@outline/api-client";

const ProfileCreateSchema = z.object({
  name: z.string().min(1),
  serverUrl: z.string().min(1),
  apiKey: z.string().min(1),
});

const ProfileUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  serverUrl: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
});

function ok<T>(data: T) {
  return { ok: true as const, data };
}

function fail(code: string, message: string, retryable = false) {
  return { ok: false as const, error: { code, message, retryable } };
}

export function registerProfileHandlers(): void {
  ipcMain.handle("profiles:list", async () => {
    try {
      const profiles = await readProfiles();
      return ok(profiles.map((p) => ({
        id: p.id,
        name: p.name,
        serverUrl: p.serverUrl,
        createdAt: p.createdAt,
      })));
    } catch (err) {
      return fail("READ_ERROR", err instanceof Error ? err.message : "Failed to read profiles");
    }
  });

  ipcMain.handle("profiles:create", async (_event, payload: unknown) => {
    const parsed = ProfileCreateSchema.safeParse(payload);
    if (!parsed.success) {
      return fail("VALIDATION", parsed.error.issues.map((i) => i.message).join(", "));
    }

    try {
      const profiles = await readProfiles();
      const profile: StoredProfile = {
        id: crypto.randomUUID(),
        name: parsed.data.name,
        serverUrl: parsed.data.serverUrl.replace(/\/+$/, ""),
        apiKey: parsed.data.apiKey,
        createdAt: new Date().toISOString(),
      };
      profiles.push(profile);
      await writeProfiles(profiles);
      return ok({
        id: profile.id,
        name: profile.name,
        serverUrl: profile.serverUrl,
        createdAt: profile.createdAt,
      });
    } catch (err) {
      return fail("WRITE_ERROR", err instanceof Error ? err.message : "Failed to save profile");
    }
  });

  ipcMain.handle("profiles:update", async (_event, payload: unknown) => {
    const parsed = ProfileUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      return fail("VALIDATION", parsed.error.issues.map((i) => i.message).join(", "));
    }

    try {
      const profiles = await readProfiles();
      const idx = profiles.findIndex((p) => p.id === parsed.data.id);
      if (idx === -1) return fail("NOT_FOUND", "Profile not found");

      const updated = { ...profiles[idx], ...parsed.data };
      profiles[idx] = updated;
      await writeProfiles(profiles);
      return ok({
        id: updated.id,
        name: updated.name,
        serverUrl: updated.serverUrl,
        createdAt: updated.createdAt,
      });
    } catch (err) {
      return fail("WRITE_ERROR", err instanceof Error ? err.message : "Failed to update profile");
    }
  });

  ipcMain.handle("profiles:delete", async (_event, id: unknown) => {
    if (typeof id !== "string") {
      return fail("VALIDATION", "id must be a string");
    }

    try {
      const profiles = await readProfiles();
      const filtered = profiles.filter((p) => p.id !== id);
      if (filtered.length === profiles.length) {
        return fail("NOT_FOUND", "Profile not found");
      }
      await writeProfiles(filtered);
      return ok({ deleted: true });
    } catch (err) {
      return fail("WRITE_ERROR", err instanceof Error ? err.message : "Failed to delete profile");
    }
  });

  // Verify a stored profile's token is still accepted by the server.
  // valid:false + reason:"auth" → token expired/revoked (caller should drop it)
  // valid:false + reason:"network" → server unreachable (keep the profile)
  ipcMain.handle("profiles:verify", async (_event, id: unknown) => {
    if (typeof id !== "string") {
      return fail("VALIDATION", "id must be a string");
    }

    const profile = readProfiles().find((p) => p.id === id);
    if (!profile) return fail("NOT_FOUND", "Profile not found");

    try {
      await apiRequest(
        { baseUrl: profile.serverUrl, token: profile.apiKey, timeoutMs: 8_000 },
        "auth.info",
        {},
      );
      return ok({ valid: true });
    } catch (err) {
      if (err instanceof AuthError) {
        return ok({ valid: false, reason: "auth" });
      }
      return ok({ valid: false, reason: "network" });
    }
  });

  ipcMain.handle("profiles:testConnection", async (_event, payload: unknown) => {
    const parsed = z.object({
      serverUrl: z.string().min(1),
      apiKey: z.string().min(1),
    }).safeParse(payload);

    if (!parsed.success) {
      return fail("VALIDATION", "serverUrl and apiKey required");
    }

    try {
      const result = await apiRequest(
        { baseUrl: parsed.data.serverUrl, token: parsed.data.apiKey },
        "collections.list",
        { limit: 1 },
      );
      return ok({ connected: true, data: result });
    } catch (err) {
      return fail(
        "CONNECTION_ERROR",
        err instanceof Error ? err.message : "Connection failed",
        true,
      );
    }
  });
}
