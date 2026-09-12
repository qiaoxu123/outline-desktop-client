import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const desktopRoot = fileURLToPath(new URL("../../../", import.meta.url));

describe("official web desktop resources", () => {
  it("serves the Simplified Chinese translation dictionary", () => {
    execFileSync(process.execPath, ["scripts/prepare-official-web.mjs"], {
      cwd: desktopRoot,
      stdio: "pipe",
    });

    const translation = JSON.parse(
      readFileSync(
        join(desktopRoot, "out/official-web/locales/zh_CN.json"),
        "utf8",
      ),
    ) as Record<string, string>;

    expect(translation.Home).toBe("主页");
    expect(translation.Search).toBe("搜索");
  });
});
