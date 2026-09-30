export interface OfficialWebAsset {
  file: string;
  css?: string[];
  imports?: string[];
}

/** Render the official template at launch, including Vite's extracted CSS. */
export function renderOfficialWebHtml(
  template: string,
  manifest: Record<string, OfficialWebAsset>,
  serverUrl: string,
): string {
  const entry = manifest["app/index.tsx"];
  if (!entry) throw new Error("Official Web manifest entry missing");
  if (!template.includes("{env}")) {
    throw new Error("Official Web runtime configuration placeholder missing");
  }
  const css = new Set<string>();
  const visited = new Set<string>();
  const collect = (key: string) => {
    if (visited.has(key)) return;
    visited.add(key);
    const asset = manifest[key];
    if (!asset) throw new Error(`Official Web manifest import missing: ${key}`);
    for (const dependency of asset.imports ?? []) collect(dependency);
    for (const file of asset.css ?? []) css.add(file);
  };
  collect("app/index.tsx");
  const environment = JSON.stringify({
    ENVIRONMENT: "production",
    URL: "outline://app",
    CDN_URL: "outline://app",
    API_URL: "outline://app/api",
    INITIAL_SERVER_URL: serverUrl,
    VERSION: "desktop",
    DEFAULT_LANGUAGE: "zh_CN",
    analytics: [],
    ENABLE_UPDATES: false,
  }).replace(/</g, "\\u003c");
  return template
    .replace("{lang}", "zh-CN")
    .replace("{title}", "Outline")
    .replace("{description}", "Outline")
    .replaceAll("{cdn-url}", "outline://app")
    .replace("{head-tags}", [...css].map((file) => `<link rel="stylesheet" href="/static/${file}">`).join(""))
    .replace("{env}", `<script>window.env=${environment}</script>`)
    .replace("{script-tags}", `<script type="module" src="/static/${entry.file}"></script>`)
    .replace("{content}", "");
}
