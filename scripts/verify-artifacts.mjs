import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile, stat, open } from "node:fs/promises";
import { join, resolve } from "node:path";

const [directory, version, platform = "all", arch = "all"] = process.argv.slice(2);
if (!directory || !version) throw new Error("Usage: verify-artifacts.mjs directory version [mac|win|linux] [x64|arm64]");
const root = resolve(directory);
const platforms = platform === "all" ? ["mac", "win", "linux"] : [platform];
const architectures = arch === "all" ? ["x64", "arm64"] : [arch];
const extensions = { mac: ["dmg", "zip"], win: ["exe", "zip"], linux: ["AppImage", "deb"] };
const assets = [];
for (const os of platforms) {
  if (!extensions[os]) throw new Error(`Unsupported platform: ${os}`);
  for (const architecture of architectures) {
    for (const extension of extensions[os]) {
      const name = `Outline-Desktop-${version}-${os}-${architecture}.${extension}`;
      const path = join(root, name);
      const info = await stat(path);
      if (info.size < 1_000_000) throw new Error(`Installer is empty/truncated: ${name}`);
      const handle = await open(path, "r");
      try {
        const head = Buffer.alloc(8);
        await handle.read(head, 0, head.length, 0);
        const expected = { zip: "504b0304", exe: "4d5a", AppImage: "7f454c46", deb: "213c617263683e0a" }[extension];
        if (expected && !head.toString("hex").startsWith(expected)) throw new Error(`Invalid installer header: ${name}`);
        if (extension === "dmg") {
          const trailer = Buffer.alloc(4);
          await handle.read(trailer, 0, 4, info.size - 512);
          if (trailer.toString() !== "koly") throw new Error(`Invalid DMG trailer: ${name}`);
        }
      } finally { await handle.close(); }
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(path)) hash.update(chunk);
      assets.push({ name, bytes: info.size, sha256: hash.digest("hex"), platform: os, arch: architecture });
    }
  }
}
if (platform === "all") {
  for (const os of platforms) for (const architecture of architectures) {
    const report = JSON.parse(await readFile(join(root, `verification-${os}-${architecture}.json`), "utf8"));
    if (report.version !== version) throw new Error("Mixed installer versions");
    for (const asset of report.assets) {
      const actual = assets.find((entry) => entry.name === asset.name);
      if (!actual || actual.sha256 !== asset.sha256 || actual.bytes !== asset.bytes) throw new Error(`Downloaded artifact changed: ${asset.name}`);
    }
  }
  await writeFile(join(root, "SHA256SUMS.txt"), assets.map((entry) => `${entry.sha256}  ${entry.name}`).join("\n") + "\n");
  await writeFile(join(root, "verification.json"), JSON.stringify({ version, commit: process.env.BUILD_COMMIT ?? "local", checks: ["12 expected installers", "file sizes", "container signatures", "downloaded artifact digests"], assets }, null, 2));
} else {
  await writeFile(join(root, `verification-${platform}-${arch}.json`), JSON.stringify({ version, assets }, null, 2));
}
console.log(`Verified ${assets.length} installers for ${version}`);
