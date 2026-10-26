import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

// Exercise the built bundle, which is what Paperclip serves to the browser.
const bundlePath = fileURLToPath(new URL("../dist/ui-parser.js", import.meta.url));
const ts = "2026-10-26T12:00:00.000Z";

describe("dist/ui-parser.js", () => {
  it("is self-contained", () => {
    const source = readFileSync(bundlePath, "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\(/);
  });

  it("renders OpenCode JSONL events", async () => {
    const { parseStdoutLine } = await import(bundlePath);

    expect(parseStdoutLine(JSON.stringify({ type: "text", part: { text: "Done." } }), ts)).toEqual([
      { kind: "assistant", ts, text: "Done." },
    ]);
    expect(
      parseStdoutLine(JSON.stringify({ type: "reasoning", part: { text: "Thinking" } }), ts),
    ).toEqual([{ kind: "thinking", ts, text: "Thinking" }]);
    const [result] = parseStdoutLine(
      JSON.stringify({
        type: "step_finish",
        part: {
          reason: "stop",
          cost: 0.001,
          tokens: { input: 50, output: 10, reasoning: 5, cache: { read: 7 } },
        },
      }),
      ts,
    );
    expect(result).toMatchObject({
      kind: "result",
      inputTokens: 50,
      outputTokens: 15,
      cachedTokens: 7,
      costUsd: 0.001,
    });
  });

  it("falls back to plain stdout for non-JSON lines", async () => {
    const { parseStdoutLine } = await import(bundlePath);

    expect(parseStdoutLine("plain text", ts)).toEqual([{ kind: "stdout", ts, text: "plain text" }]);
  });
});
