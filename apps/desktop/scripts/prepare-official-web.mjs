import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = resolve(desktopRoot, "../..");
const source = join(projectRoot, "vendor/outline-web/build/app");
const target = join(desktopRoot, "out/official-web");

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true, force: true });

// Electron serves the official build through outline://app. The server normally
// fills these placeholders; the desktop shell provides the same small runtime
// envelope without exposing any business API to the renderer.
const indexPath = join(target, "index.html");
const template = await readFile(indexPath, "utf8");
const manifest = JSON.parse(
  await readFile(join(target, ".vite/manifest.json"), "utf8"),
);
const entry = manifest["app/index.tsx"]?.file;
if (!entry) throw new Error("Official Web manifest entry missing");

const html = template
  .replace("{lang}", "zh-CN")
  .replace("{title}", "Outline")
  .replace("{description}", "Outline")
  .replace("{cdn-url}", "outline://app")
  .replace("{head-tags}", "")
  .replace(
    "{env}",
    '<script>window.env={ENVIRONMENT:"production",URL:"outline://app",CDN_URL:"outline://app",VERSION:"desktop",DEFAULT_LANGUAGE:"zh_CN",ENABLE_UPDATES:false,analytics:[]}</script>',
  )
  .replace("{script-tags}", `<script type="module" src="/static/${entry}"></script>`)
  .replace("{content}", "");
await writeFile(indexPath, html);
