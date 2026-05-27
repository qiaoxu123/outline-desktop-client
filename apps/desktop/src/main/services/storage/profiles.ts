import { app } from "electron";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface StoredProfile {
  id: string;
  name: string;
  serverUrl: string;
  apiKey: string;
  createdAt: string;
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
