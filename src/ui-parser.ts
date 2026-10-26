// Bundled by scripts/build-ui-parser.mjs into a self-contained, browser-safe
// module. Runs execute through OpenCode, so stdout is OpenCode's JSONL stream.
import { parseOpenCodeStdoutLine } from "@paperclipai/adapter-opencode-local/ui";
import type { TranscriptEntry } from "@paperclipai/adapter-utils";

export function parseStdoutLine(line: string, ts: string): TranscriptEntry[] {
  try {
    return parseOpenCodeStdoutLine(line, ts);
  } catch {
    return [{ kind: "stdout", ts, text: line }];
  }
}
