import { readdir, rename, access } from "node:fs/promises";
import { join, resolve } from "node:path";

const directory = process.argv[2];
if (!directory) throw new Error("Usage: normalize-artifacts.mjs directory");
const root = resolve(directory);
for (const name of await readdir(root)) {
  const normalized = name.replace(/-linux-x86_64\.AppImage$/, "-linux-x64.AppImage")
    .replace(/-linux-amd64\.deb$/, "-linux-x64.deb");
  if (name === normalized) continue;
  let exists = false;
  try { await access(join(root, normalized)); exists = true; } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (exists) throw new Error(`Refusing to overwrite installer: ${normalized}`);
  await rename(join(root, name), join(root, normalized));
  console.log(`${name} -> ${normalized}`);
}
