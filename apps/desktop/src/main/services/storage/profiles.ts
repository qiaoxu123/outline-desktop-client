import { app } from "electron";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface StoredProfile {
  id: string;
  name: string;
  serverUrl: string;
  apiKey: string;
  createdAt: string;
  /**
   * The user's personal-notes folder on the server, used by the sidebar
   * "个人笔记" zone. It points at an existing document subtree (e.g.
   * 成员笔记 / 博士 / 乔旭) so notes created there sync normally and don't
   * add a new top-level collection. Unset until detected or chosen once.
   */
  personalRootDocId?: string;
  personalRootCollectionId?: string;
}

function profilesPath(): string {
  return join(app.getPath("userData"), "profiles.json");
}

function ensureDir(): void {
  mkdirSync(app.getPath("userData"), { recursive: true });
}

export function readProfiles(): StoredProfile[] {
  try {
    ensureDir();
    const data = readFileSync(profilesPath(), "utf-8");
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeProfiles(profiles: StoredProfile[]): void {
  ensureDir();
  writeFileSync(profilesPath(), JSON.stringify(profiles, null, 2), "utf-8");
}

export function findProfile(id: string): StoredProfile | undefined {
  const profiles = readProfiles();
  return profiles.find((p) => p.id === id);
}

/** Network config for API calls from the main process */
export interface NetworkConfig {
  caCertPath: string;
  proxyUrl: string;
}

const DEFAULT_NETWORK: NetworkConfig = {
  caCertPath: "", // Will be set at runtime
  proxyUrl: "",
};

let networkConfig: NetworkConfig = DEFAULT_NETWORK;

export function getNetworkConfig(): NetworkConfig {
  return networkConfig;
}

export function setNetworkConfig(config: Partial<NetworkConfig>): void {
  networkConfig = { ...networkConfig, ...config };
}
