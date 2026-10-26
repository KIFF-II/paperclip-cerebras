import type { AdapterModel } from "@paperclipai/adapter-utils";

/** OpenCode provider id for Cerebras (models.dev `cerebras`). */
export const CEREBRAS_PROVIDER = "cerebras";
export const CEREBRAS_API_KEY_ENV = "CEREBRAS_API_KEY";
export const CEREBRAS_API_BASE_URL = "https://api.cerebras.ai/v1";

export const DEFAULT_CEREBRAS_MODEL = "cerebras/gpt-oss-120b";

export const models: AdapterModel[] = [
  { id: DEFAULT_CEREBRAS_MODEL, label: "OpenAI GPT OSS 120B" },
  { id: "cerebras/qwen-3.8-27b", label: "Qwen 3.8 27B" },
];

export type CerebrasModelResolution =
  | { ok: true; model: string; bareModel: string }
  | { ok: false; error: string };

/**
 * Normalize a configured model to OpenCode's `cerebras/<id>` form.
 * Accepts bare Cerebras ids (`gpt-oss-120b`) and rejects other providers so a
 * cerebras_local agent can never silently bill a different vendor.
 */
export function resolveCerebrasModel(raw: unknown): CerebrasModelResolution {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    return {
      ok: true,
      model: DEFAULT_CEREBRAS_MODEL,
      bareModel: stripProvider(DEFAULT_CEREBRAS_MODEL),
    };
  }
  const slash = value.indexOf("/");
  if (slash === -1) {
    return { ok: true, model: `${CEREBRAS_PROVIDER}/${value}`, bareModel: value };
  }
  const provider = value.slice(0, slash);
  const bareModel = value.slice(slash + 1).trim();
  if (provider !== CEREBRAS_PROVIDER) {
    return {
      ok: false,
      error: `cerebras_local only runs Cerebras models; "${value}" uses provider "${provider}". Use a cerebras/<model> id or switch the agent to opencode_local.`,
    };
  }
  if (!bareModel) {
    return {
      ok: false,
      error: `Model "${value}" is missing a model id after "${CEREBRAS_PROVIDER}/".`,
    };
  }
  return { ok: true, model: `${CEREBRAS_PROVIDER}/${bareModel}`, bareModel };
}

function stripProvider(model: string): string {
  return model.slice(model.indexOf("/") + 1);
}
