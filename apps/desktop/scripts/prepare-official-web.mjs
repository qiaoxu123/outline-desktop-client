import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = resolve(desktopRoot, "../..");
const source = join(projectRoot, "vendor/outline-web/build/app");
const target = join(desktopRoot, "out/official-web");

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true, force: true });

// The Outline server normally exposes these dictionaries through
// /locales/:lng.json. The desktop shell does not run that server, so flatten
// the source dictionaries into the exact URL layout expected by i18next.
const localesSource = join(projectRoot, "vendor/outline-web/shared/i18n/locales");
const localesTarget = join(target, "locales");
await mkdir(localesTarget, { recursive: true });
const localeDirectories = await readdir(localesSource, { withFileTypes: true });
await Promise.all(
  localeDirectories
    .filter((entry) => entry.isDirectory())
    .map((entry) =>
      cp(
        join(localesSource, entry.name, "translation.json"),
        join(localesTarget, `${entry.name}.json`),
        { force: true },
      ),
    ),
);

// Preserve server placeholders: Electron injects the current profile and CSS
// at launch. Pre-rendering here loses INITIAL_SERVER_URL in packaged builds.
const template = await readFile(join(target, "index.html"), "utf8");
const manifest = JSON.parse(await readFile(join(target, ".vite/manifest.json"), "utf8"));
if (!manifest["app/index.tsx"]?.file || !template.includes("{env}")) {
  throw new Error("Official Web template or manifest is incomplete");
}
