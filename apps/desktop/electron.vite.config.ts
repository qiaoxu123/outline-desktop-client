import { resolve } from "path";
import { defineConfig } from "electron-vite";

// Electron bundles only the native shell and preload. All UI assets come
// exclusively from the official Outline Web submodule (vendor/outline-web).
export default defineConfig({
  main: {
    build: {
      outDir: "out/main",
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main/index.ts"),
        },
      },
    },
  },
  preload: {
    build: {
      outDir: "out/preload",
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/preload/index.ts"),
        },
      },
    },
  },
});
