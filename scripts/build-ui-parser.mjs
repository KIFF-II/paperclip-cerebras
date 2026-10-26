// Bundle src/ui-parser.ts into dist/ui-parser.js with no runtime imports,
// as required by the Paperclip adapter UI parser contract.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// OpenCode's `./ui` entry also re-exports build-config, which drags in
// adapter-utils top-level code. Its stdout parser alone has no imports.
const openCodeUiEntry = fileURLToPath(import.meta.resolve("@paperclipai/adapter-opencode-local/ui"));
const openCodeStdoutParser = path.join(path.dirname(openCodeUiEntry), "parse-stdout.js");
const parserOnly = {
  name: "opencode-parser-only",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^@paperclipai\/adapter-opencode-local\/ui$/ }, () => ({ path: openCodeStdoutParser }));
  },
};

const result = await build({
  plugins: [parserOnly],
  entryPoints: ["src/ui-parser.ts"],
  outfile: "dist/ui-parser.js",
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  treeShaking: true,
  metafile: true,
  logLevel: "warning",
});

// esbuild reads modules it later tree-shakes away; only bytes that reach the output count.
const output = result.metafile.outputs["dist/ui-parser.js"];
const inputs = Object.entries(output.inputs)
  .filter(([, info]) => info.bytesInOutput > 0)
  .map(([input]) => input);
const leaked = [
  ...inputs.filter((input) => input.includes("adapter-utils")),
  ...output.imports.map((entry) => entry.path),
];
if (leaked.length > 0) {
  console.error(`ui-parser bundle pulled in server-side modules:\n  ${leaked.join("\n  ")}`);
  process.exit(1);
}
console.log(`dist/ui-parser.js bundled from ${inputs.length} input(s)`);
