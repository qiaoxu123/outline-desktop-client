import { readFile, stat } from "node:fs/promises";
import { resolve, join, relative } from "node:path";

const root = resolve("apps/desktop/out/official-web");
const manifest = JSON.parse(await readFile(join(root, ".vite/manifest.json"), "utf8"));
const template = await readFile(join(root, "index.html"), "utf8");
if (!manifest["app/index.tsx"]?.file || !template.includes("{env}")) {
  throw new Error("Missing official entry or runtime environment placeholder");
}
const files = new Set(Object.values(manifest).flatMap((entry) => [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])]));
for (const file of files) {
  const path = resolve(root, file);
  if (relative(root, path).startsWith("..") || !(await stat(path)).size) {
    throw new Error(`Missing/invalid official resource: ${file}`);
  }
}
for (const name of ["en_US", "zh_CN"]) {
  const translation = JSON.parse(await readFile(join(root, "locales", `${name}.json`), "utf8"));
  if (!translation.Home || !translation.Search) throw new Error(`Missing translation: ${name}`);
}
for (const path of ["apps/desktop/out/main/index.js", "apps/desktop/out/preload/index.js"]) {
  if (!(await stat(path)).size) throw new Error(`Missing desktop entry: ${path}`);
}
console.log(`Verified desktop entries, runtime template, ${files.size} official resources and locale dictionaries`);
