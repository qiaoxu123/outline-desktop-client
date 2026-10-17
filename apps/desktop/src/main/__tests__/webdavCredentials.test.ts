import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const state = vi.hoisted(() => ({
  dir: "",
  available: true,
  backend: "gnome_libsecret",
}));

vi.mock("electron", () => ({
  app: { getPath: () => state.dir },
  safeStorage: {
    isEncryptionAvailable: () => state.available,
    getSelectedStorageBackend: () => state.backend,
    // Reversible fake cipher for persistence logic testing (not real crypto).
    encryptString: (value: string) => Buffer.from("encrypted:" + value),
    decryptString: (bytes: Buffer) => {
      const text = bytes.toString();
      if (!text.startsWith("encrypted:")) throw new Error("invalid cipher");
      return text.slice("encrypted:".length);
    },
  },
}));

import {
  readWebdavCredentials,
  writeWebdavCredentials,
  clearWebdavCredentials,
  webdavCredentialStatus,
} from "../services/storage/webdavCredentials";

const oldEnvUser = process.env.OUTLINE_WEBDAV_USER;
const oldEnvPass = process.env.OUTLINE_WEBDAV_PASSWORD;

beforeEach(() => {
  state.dir = mkdtempSync(join(tmpdir(), "outline-webdav-test-"));
  state.available = true;
  state.backend = "gnome_libsecret";
  delete process.env.OUTLINE_WEBDAV_USER;
  delete process.env.OUTLINE_WEBDAV_PASSWORD;
});
afterEach(() => {
  rmSync(state.dir, { recursive: true, force: true });
  if (oldEnvUser === undefined) delete process.env.OUTLINE_WEBDAV_USER;
  else process.env.OUTLINE_WEBDAV_USER = oldEnvUser;
  if (oldEnvPass === undefined) delete process.env.OUTLINE_WEBDAV_PASSWORD;
  else process.env.OUTLINE_WEBDAV_PASSWORD = oldEnvPass;
});

describe("WebDAV credential storage", () => {
  it("saves encrypted data without exposing credentials in status", () => {
    writeWebdavCredentials({ username: "user@example.com", password: "strong-secret" });
    const file = readFileSync(join(state.dir, "webdav-credentials.json"), "utf8");
    expect(file).not.toContain("strong-secret");
    expect(file).not.toContain("user@example.com");
    expect(readWebdavCredentials()).toEqual({
      username: "user@example.com",
      password: "strong-secret",
    });
    expect(webdavCredentialStatus()).toEqual({
      configured: true, source: "local", secureStorageAvailable: true,
    });
  });

  it("refuses to write without OS encryption", () => {
    state.available = false;
    expect(() => writeWebdavCredentials({ username: "u", password: "p" }))
      .toThrow("系统安全存储不可用");
    expect(webdavCredentialStatus().configured).toBe(false);
  });

  it("never stores with the Linux basic_text backend", () => {
    state.backend = "basic_text";
    if (process.platform === "linux") {
      expect(() => writeWebdavCredentials({ username: "u", password: "p" }))
        .toThrow("系统安全存储不可用");
    }
  });

  it("supports environment credentials without misreporting local encryption", () => {
    process.env.OUTLINE_WEBDAV_USER = "test@example.com";
    process.env.OUTLINE_WEBDAV_PASSWORD = "env-password";
    expect(readWebdavCredentials()?.password).toBe("env-password");
    expect(webdavCredentialStatus().source).toBe("environment");
  });

  it("clears saved credentials without exposing them", () => {
    writeWebdavCredentials({ username: "u", password: "p" });
    clearWebdavCredentials();
    expect(readWebdavCredentials()).toBeNull();
    expect(webdavCredentialStatus().source).toBe("none");
  });

  it("falls back to environment when the stored record cannot be decrypted", () => {
    writeWebdavCredentials({ username: "local", password: "local-secret" });
    state.available = false;
    process.env.OUTLINE_WEBDAV_USER = "environment";
    process.env.OUTLINE_WEBDAV_PASSWORD = "fallback";
    expect(readWebdavCredentials()?.password).toBe("fallback");
    expect(webdavCredentialStatus().source).toBe("environment");
  });
});
