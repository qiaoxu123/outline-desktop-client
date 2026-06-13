import tseslint from "@electron-toolkit/eslint-config-ts";

// ESLint v9 flat config. The repo previously had no config file, so
// `npm run lint` errored out before linting anything. This wires up the
// TypeScript recommended rules over the renderer/main/preload sources.
export default tseslint.config(
  { ignores: ["out/**", "dist/**", "node_modules/**", "build/**"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
);
