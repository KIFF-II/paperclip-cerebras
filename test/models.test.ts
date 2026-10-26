import { describe, expect, it } from "vitest";
import { DEFAULT_CEREBRAS_MODEL, resolveCerebrasModel } from "../src/models.js";

describe("resolveCerebrasModel", () => {
  it("defaults to gpt-oss-120b when unset", () => {
    expect(resolveCerebrasModel(undefined)).toEqual({ ok: true, model: DEFAULT_CEREBRAS_MODEL, bareModel: "gpt-oss-120b" });
    expect(resolveCerebrasModel("  ")).toMatchObject({ ok: true, model: DEFAULT_CEREBRAS_MODEL });
  });

  it("adds the cerebras/ prefix to bare ids", () => {
    expect(resolveCerebrasModel("qwen-3.8-27b")).toEqual({ ok: true, model: "cerebras/qwen-3.8-27b", bareModel: "qwen-3.8-27b" });
  });

  it("keeps already-prefixed ids", () => {
    expect(resolveCerebrasModel(" cerebras/gpt-oss-120b ")).toEqual({ ok: true, model: "cerebras/gpt-oss-120b", bareModel: "gpt-oss-120b" });
  });

  it("rejects other providers", () => {
    const result = resolveCerebrasModel("anthropic/claude-sonnet-5-5");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("opencode_local");
  });

  it("rejects an empty model after the prefix", () => {
    expect(resolveCerebrasModel("cerebras/").ok).toBe(false);
  });
});
