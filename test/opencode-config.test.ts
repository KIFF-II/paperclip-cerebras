import { describe, expect, it } from "vite-plus/test";
import {
  OPENCODE_PROVIDERS_ENV,
  resolveCerebrasLimits,
  withCerebrasOpenCodeLimits,
} from "../src/server/opencode-config.js";

function injected(config: Record<string, unknown>, hostEnv: NodeJS.ProcessEnv = {}) {
  const next = withCerebrasOpenCodeLimits(config, "gpt-oss-120b", hostEnv);
  const env = next.env as Record<string, string>;
  return JSON.parse(env[OPENCODE_PROVIDERS_ENV]!);
}

describe("resolveCerebrasLimits", () => {
  it("defaults to the paid tier with a 16K output cap", () => {
    expect(resolveCerebrasLimits({})).toEqual({ tier: "paid", context: 131_072, output: 16_384 });
  });

  it("uses the free tier context window and a smaller output cap", () => {
    expect(resolveCerebrasLimits({ tier: "free" })).toEqual({
      tier: "free",
      context: 65_536,
      output: 8_192,
    });
  });

  it("clamps maxOutputTokens to the tier maximum and a sane floor", () => {
    expect(resolveCerebrasLimits({ tier: "free", maxOutputTokens: 100_000 }).output).toBe(32_768);
    expect(resolveCerebrasLimits({ maxOutputTokens: 10 }).output).toBe(1_024);
    expect(resolveCerebrasLimits({ maxOutputTokens: 24_000.7 }).output).toBe(24_000);
  });
});

describe("withCerebrasOpenCodeLimits", () => {
  it("injects the model limit for OpenCode", () => {
    expect(injected({ tier: "free", env: { CEREBRAS_API_KEY: "csk" } })).toEqual({
      cerebras: { models: { "gpt-oss-120b": { limit: { context: 65_536, output: 8_192 } } } },
    });
  });

  it("keeps other env vars", () => {
    const next = withCerebrasOpenCodeLimits(
      { env: { CEREBRAS_API_KEY: "csk" } },
      "gpt-oss-120b",
      {},
    );
    expect((next.env as Record<string, string>).CEREBRAS_API_KEY).toBe("csk");
  });

  it("merges into providers the operator already configured", () => {
    const existing = JSON.stringify({
      gateway: { options: { baseURL: "https://example.test/v1" } },
      cerebras: { options: { timeout: 600_000 }, models: { "qwen-3.8-27b": { name: "Qwen" } } },
    });

    expect(injected({ env: { [OPENCODE_PROVIDERS_ENV]: existing } })).toEqual({
      gateway: { options: { baseURL: "https://example.test/v1" } },
      cerebras: {
        options: { timeout: 600_000 },
        models: {
          "qwen-3.8-27b": { name: "Qwen" },
          "gpt-oss-120b": { limit: { context: 131_072, output: 16_384 } },
        },
      },
    });
  });

  it("reads the operator's providers from the host env when config has none", () => {
    const hostEnv = { [OPENCODE_PROVIDERS_ENV]: JSON.stringify({ gateway: {} }) };

    expect(injected({}, hostEnv)).toHaveProperty("gateway");
  });

  it("leaves an explicit operator limit alone", () => {
    const existing = JSON.stringify({
      cerebras: { models: { "gpt-oss-120b": { limit: { context: 1, output: 1 } } } },
    });
    const config = { env: { [OPENCODE_PROVIDERS_ENV]: existing } };

    expect(withCerebrasOpenCodeLimits(config, "gpt-oss-120b", {})).toBe(config);
  });

  it("leaves malformed operator JSON for opencode_local to report", () => {
    const config = { env: { [OPENCODE_PROVIDERS_ENV]: "{not json" } };

    expect(withCerebrasOpenCodeLimits(config, "gpt-oss-120b", {})).toBe(config);
  });
});
