import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

// OpenCode's `./ui` entry also re-exports build-config, which drags in
// adapter-utils top-level code. Its stdout parser alone has no imports.
const openCodeStdoutParser = fileURLToPath(
  new URL("parse-stdout.js", import.meta.resolve("@paperclipai/adapter-opencode-local/ui")),
);

export default defineConfig({
  fmt: {
    // Editor settings keep their own 4-space style (see .editorconfig).
    ignorePatterns: [".vscode/**"],
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  pack: [
    {
      // Server-side entry points. Dependencies stay external and are installed from npm.
      entry: {
        index: "src/index.ts",
        "server/index": "src/server/index.ts",
      },
      platform: "node",
      format: "esm",
      fixedExtension: false,
      dts: true,
      sourcemap: true,
      // Both configs build in parallel; `npm run build` clears dist/ beforehand.
      clean: false,
    },
    {
      // Browser-evaluated transcript parser: must be one self-contained module.
      entry: { "ui-parser": "src/ui-parser.ts" },
      platform: "neutral",
      format: "esm",
      fixedExtension: false,
      dts: false,
      clean: false,
      alias: { "@paperclipai/adapter-opencode-local/ui": openCodeStdoutParser },
      deps: {
        alwaysBundle: [/^@paperclipai\/adapter-opencode-local/],
        onlyBundle: ["@paperclipai/adapter-opencode-local"],
        onlyImport: [],
      },
    },
  ],
});
