import { app } from "electron";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface AiConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

const DEFAULTS: AiConfig = {
  apiKey: "",
  model: "deepseek-chat",
  baseUrl: "https://api.deepseek.com/v1",
};

function configPath(): string {
  return join(app.getPath("userData"), "ai-config.json");
}

function ensureDir(): void {
  mkdirSync(app.getPath("userData"), { recursive: true });
}

export function readAiConfig(): AiConfig {
  try {
    ensureDir();
    const data = readFileSync(configPath(), "utf-8");
    const parsed = JSON.parse(data);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeAiConfig(partial: Partial<AiConfig>): void {
  ensureDir();
  const current = readAiConfig();
  const next = { ...current, ...partial };
  writeFileSync(configPath(), JSON.stringify(next, null, 2), "utf-8");
}
