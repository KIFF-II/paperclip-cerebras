import { asNumber, asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import { CEREBRAS_PROVIDER } from "../models.js";

/** opencode_local merges this JSON into the runtime opencode.json `provider` block. */
export const OPENCODE_PROVIDERS_ENV = "PAPERCLIP_OPENCODE_PROVIDERS";

export type CerebrasTier = "free" | "paid";

/**
 * Per-tier limits from the Cerebras model docs. models.dev only carries the
 * paid limits, so free-tier agents would otherwise overrun the context window.
 */
const TIER_LIMITS: Record<CerebrasTier, { context: number; output: number }> = {
  free: { context: 65_536, output: 32_768 },
  paid: { context: 131_072, output: 40_960 },
};

/**
 * Cerebras estimates each request against the tokens-per-minute budget as
 * prompt + max_completion_tokens, and OpenCode requests the model's full output
 * limit. Capping it keeps one request from reserving most of the budget: the
 * free tier allows only 30K uncached tokens per minute.
 */
const DEFAULT_MAX_OUTPUT_TOKENS: Record<CerebrasTier, number> = {
  free: 8_192,
  paid: 16_384,
};

export function readCerebrasTier(config: Record<string, unknown>): CerebrasTier {
  return asString(config.tier, "paid").trim().toLowerCase() === "free" ? "free" : "paid";
}

export function resolveCerebrasLimits(config: Record<string, unknown>): {
  tier: CerebrasTier;
  context: number;
  output: number;
} {
  const tier = readCerebrasTier(config);
  const limits = TIER_LIMITS[tier];
  const requested = Math.floor(asNumber(config.maxOutputTokens, DEFAULT_MAX_OUTPUT_TOKENS[tier]));
  const output = Math.min(Math.max(requested, 1_024), limits.output);
  return { tier, context: limits.context, output };
}

/**
 * Return config whose env carries Cerebras model limits for OpenCode, merged
 * into any PAPERCLIP_OPENCODE_PROVIDERS the operator already set. An explicit
 * `limit` for the model in that JSON wins.
 */
export function withCerebrasOpenCodeLimits(
  config: Record<string, unknown>,
  bareModel: string,
  hostEnv: NodeJS.ProcessEnv = process.env,
): Record<string, unknown> {
  const env = parseObject(config.env);
  const existingRaw = env[OPENCODE_PROVIDERS_ENV] ?? hostEnv[OPENCODE_PROVIDERS_ENV];
  let providers: Record<string, unknown> = {};
  if (typeof existingRaw === "string" && existingRaw.trim()) {
    try {
      providers = parseObject(JSON.parse(existingRaw));
    } catch {
      // Leave malformed operator JSON untouched; opencode_local reports it.
      return config;
    }
  }

  const provider = parseObject(providers[CEREBRAS_PROVIDER]);
  const models = parseObject(provider.models);
  const model = parseObject(models[bareModel]);
  if (model.limit !== undefined) return config;

  const { context, output } = resolveCerebrasLimits(config);
  const nextProviders = {
    ...providers,
    [CEREBRAS_PROVIDER]: {
      ...provider,
      models: { ...models, [bareModel]: { ...model, limit: { context, output } } },
    },
  };
  return {
    ...config,
    env: { ...env, [OPENCODE_PROVIDERS_ENV]: JSON.stringify(nextProviders) },
  };
}
