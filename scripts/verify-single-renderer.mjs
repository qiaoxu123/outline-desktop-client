import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const exists = async (path) => access(path).then(() => true, () => false);
const desktop = join(root, "apps/desktop");
const legacySource = join(desktop, "src/renderer");
const legacyOutput = join(desktop, "out/renderer");
if (await exists(legacySource)) throw new Error("Legacy React renderer source must not exist");
if (await exists(legacyOutput)) throw new Error("Legacy React renderer output must not be packaged");

const config = await readFile(join(desktop, "electron.vite.config.ts"), "utf8");
if (/\brenderer\s*:/.test(config) || config.includes("@vitejs/plugin-react")) {
  throw new Error("Electron Vite must not build the legacy renderer");
}
const main = await readFile(join(desktop, "src/main/index.ts"), "utf8");
if (!main.includes("mainWindow.loadURL(`${officialScheme}://app/`)")) {
  throw new Error("Main window must load only official Outline Web");
}
if (!(await exists(join(root, ".gitmodules")))) throw new Error("Missing Outline Web submodule config");
console.log("Verified official Outline Web is the only desktop renderer");
