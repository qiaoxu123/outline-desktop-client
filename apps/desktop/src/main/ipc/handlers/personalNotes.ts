import { ipcMain } from "electron";
import { z } from "zod";
import { readProfiles, writeProfiles } from "../../services/storage/profiles";

function ok<T>(data: T) {
  return { ok: true as const, data };
}

function fail(code: string, message: string) {
  return { ok: false as const, error: { code, message } };
}

const SetRootSchema = z.object({
  profileId: z.string().min(1),
  docId: z.string().min(1),
  collectionId: z.string().min(1),
});

const ClearRootSchema = z.object({
  profileId: z.string().min(1),
});

/**
 * Stores only the *pointer* to the user's personal-notes folder on the server
 * (docId + collectionId) in profiles.json. The notes themselves are ordinary
 * server documents nested under that folder, so they sync like everything else
 * and need no local storage. See StoredProfile.personalRootDocId.
 */
export function registerPersonalNotesHandlers(): void {
  ipcMain.handle("personalNotes:getRoot", (_event, profileId: unknown) => {
    if (typeof profileId !== "string") {
      return fail("VALIDATION", "profileId must be a string");
    }
    const profile = readProfiles().find((p) => p.id === profileId);
    if (!profile) return fail("NOT_FOUND", "Profile not found");
    if (!profile.personalRootDocId || !profile.personalRootCollectionId) {
      return ok(null);
    }
    return ok({
      docId: profile.personalRootDocId,
      collectionId: profile.personalRootCollectionId,
    });
  });

  ipcMain.handle("personalNotes:setRoot", (_event, payload: unknown) => {
    const parsed = SetRootSchema.safeParse(payload);
    if (!parsed.success) {
      return fail("VALIDATION", parsed.error.issues.map((i) => i.message).join(", "));
    }
    const profiles = readProfiles();
    const idx = profiles.findIndex((p) => p.id === parsed.data.profileId);
    if (idx === -1) return fail("NOT_FOUND", "Profile not found");

    profiles[idx] = {
      ...profiles[idx],
      personalRootDocId: parsed.data.docId,
      personalRootCollectionId: parsed.data.collectionId,
    };
    writeProfiles(profiles);
    return ok({ docId: parsed.data.docId, collectionId: parsed.data.collectionId });
  });

  ipcMain.handle("personalNotes:clearRoot", (_event, payload: unknown) => {
    const parsed = ClearRootSchema.safeParse(payload);
    if (!parsed.success) {
      return fail("VALIDATION", "profileId required");
    }
    const profiles = readProfiles();
    const idx = profiles.findIndex((p) => p.id === parsed.data.profileId);
    if (idx === -1) return fail("NOT_FOUND", "Profile not found");

    const next = { ...profiles[idx] };
    delete next.personalRootDocId;
    delete next.personalRootCollectionId;
    profiles[idx] = next;
    writeProfiles(profiles);
    return ok({ cleared: true });
  });
}
