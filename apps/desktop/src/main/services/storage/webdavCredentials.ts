import { app, safeStorage } from "electron";
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface WebdavCredentials {
  username: string;
  password: string;
}

type CredentialSource = "local" | "environment" | "none";

function credentialsPath(): string {
  return join(app.getPath("userData"), "webdav-credentials.json");
}

function secureStorageAvailable(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false;
  // Some Linux systems without a working Secret Service silently fall back
  // to "basic_text", which is not encryption. Do not store secrets there.
  if (process.platform === "linux" &&
      safeStorage.getSelectedStorageBackend() === "basic_text") return false;
  return true;
}

/** Reads only the locally encrypted record (never an environment fallback). */
function readSavedCredentials(): WebdavCredentials | null {
  try {
    const saved = JSON.parse(readFileSync(credentialsPath(), "utf8")) as {
      version: number;
      encrypted: string;
    };
    if (saved.version === 1 && typeof saved.encrypted === "string" &&
        secureStorageAvailable()) {
      const decoded = safeStorage.decryptString(Buffer.from(saved.encrypted, "base64"));
      const credentials = JSON.parse(decoded) as WebdavCredentials;
      if (credentials.username && credentials.password) return credentials;
    }
  } catch {
    // Not configured, OS keyring locked, or no longer decryptable.
  }
  return null;
}

/** Credentials are never returned to renderer code. */
export function readWebdavCredentials(): WebdavCredentials | null {
  const saved = readSavedCredentials();
  if (saved) return saved;
  const username = process.env.OUTLINE_WEBDAV_USER?.trim();
  const password = process.env.OUTLINE_WEBDAV_PASSWORD;
  return username && password ? { username, password } : null;
}

export function webdavCredentialStatus(): {
  configured: boolean;
  source: CredentialSource;
  secureStorageAvailable: boolean;
} {
  const canEncrypt = secureStorageAvailable();
  const saved = readSavedCredentials();
  const envPresent = !!(process.env.OUTLINE_WEBDAV_USER?.trim() &&
    process.env.OUTLINE_WEBDAV_PASSWORD);
  const source: CredentialSource = saved ? "local" :
    envPresent ? "environment" : "none";
  return { configured: source !== "none", source, secureStorageAvailable: canEncrypt };
}

/** Save locally using the OS encryption service, never plaintext fallback. */
export function writeWebdavCredentials(credentials: WebdavCredentials): void {
  if (!secureStorageAvailable()) {
    throw new Error(
      "系统安全存储不可用。请启用系统密钥环，或通过环境变量配置 WebDAV。",
    );
  }
  const username = credentials.username.trim();
  if (!username || !credentials.password) throw new Error("用户名和应用密码均不能为空");
  const encrypted = safeStorage.encryptString(
    JSON.stringify({ username, password: credentials.password }),
  ).toString("base64");
  const path = credentialsPath();
  mkdirSync(app.getPath("userData"), { recursive: true });
  const temp = path + ".tmp";
  try {
    writeFileSync(temp, JSON.stringify({ version: 1, encrypted }), { mode: 0o600 });
    renameSync(temp, path);
    if (process.platform !== "win32") chmodSync(path, 0o600);
  } finally {
    rmSync(temp, { force: true });
  }
}

export function clearWebdavCredentials(): void {
  rmSync(credentialsPath(), { force: true });
}
