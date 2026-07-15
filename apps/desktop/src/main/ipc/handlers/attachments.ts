import { ipcMain, net } from "electron";
import { z } from "zod";
import { findProfile } from "../../services/storage/profiles";
import { apiRequest } from "@outline/api-client";

/**
 * File upload to Outline for the editor's drag/paste-to-upload. Two-step
 * Outline flow, run entirely in the main process so the API key never reaches
 * the renderer:
 *   1. attachments.create → presigned upload params (uploadUrl + form fields)
 *   2. multipart POST the bytes to files.create (local storage) / S3
 * The multipart POST uses Electron's net.fetch — the same Chromium network
 * stack the rest of the app relies on (Node's fetch fails against this server).
 */

const UploadSchema = z.object({
  profileId: z.string().min(1),
  documentId: z.string().optional(),
  name: z.string().min(1),
  contentType: z.string().min(1),
  dataBase64: z.string().min(1),
});

interface CreateResp {
  data: {
    uploadUrl: string;
    form: Record<string, string>;
    attachment: {
      id: string;
      url: string;
      name: string;
      contentType: string;
    };
  };
}

export function registerAttachmentHandlers(): void {
  ipcMain.handle("attachments:upload", async (_event, payload: unknown) => {
    const parsed = UploadSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false as const, error: { message: "invalid upload payload" } };
    }
    const { profileId, documentId, name, contentType, dataBase64 } =
      parsed.data;
    const profile = findProfile(profileId);
    if (!profile) {
      return { ok: false as const, error: { message: "profile not found" } };
    }

    try {
      const bytes = Buffer.from(dataBase64, "base64");
      const create = await apiRequest<CreateResp>(
        { baseUrl: profile.serverUrl, token: profile.apiKey },
        "attachments.create",
        {
          name,
          contentType,
          size: bytes.length,
          ...(documentId ? { documentId } : {}),
        },
      );
      const { uploadUrl, form, attachment } = create.data;

      const fd = new FormData();
      for (const [k, v] of Object.entries(form)) fd.append(k, v);
      fd.append("file", new Blob([bytes], { type: contentType }), name);

      const base = profile.serverUrl.replace(/\/+$/, "");
      const target = uploadUrl.startsWith("http") ? uploadUrl : base + uploadUrl;
      const up = await net.fetch(target, {
        method: "POST",
        headers: { Authorization: `Bearer ${profile.apiKey}` },
        body: fd,
      });
      if (up.status >= 300) {
        return {
          ok: false as const,
          error: { message: `upload failed (${up.status})` },
        };
      }

      return {
        ok: true as const,
        data: {
          id: attachment.id,
          url: attachment.url,
          // Absolute URL: a relative /api/attachments.redirect link gets turned
          // into a file-node by Outline (which mangles CJK labels and strips
          // sibling text); an absolute URL stays a normal link, so the filename
          // and a download link can live on one line.
          absoluteUrl: attachment.url.startsWith("http")
            ? attachment.url
            : base + attachment.url,
          name: attachment.name || name,
          contentType,
          isImage: contentType.startsWith("image/"),
        },
      };
    } catch (err) {
      return {
        ok: false as const,
        error: {
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  });
}
