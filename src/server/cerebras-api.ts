import type { AdapterModel } from "@paperclipai/adapter-utils";
import { parseObject } from "@paperclipai/adapter-utils/server-utils";
import {
  CEREBRAS_API_BASE_URL,
  CEREBRAS_API_KEY_ENV,
  CEREBRAS_PROVIDER,
  models as staticModels,
} from "../models.js";

export type CerebrasApiKeySource =
  | { kind: "config"; value: string }
  | { kind: "secret_ref" }
  | { kind: "host_env"; value: string }
  | { kind: "missing" };

/**
 * Locate the Cerebras key. Execution receives resolved plain strings; the
 * environment test may still see an unresolved secret binding object.
 */
export function readCerebrasApiKey(
  config: Record<string, unknown>,
  hostEnv: NodeJS.ProcessEnv = process.env,
): CerebrasApiKeySource {
  const raw = parseObject(config.env)[CEREBRAS_API_KEY_ENV];
  if (typeof raw === "string" && raw.trim()) return { kind: "config", value: raw.trim() };
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const binding = raw as Record<string, unknown>;
    if (binding.type === "plain") {
      return typeof binding.value === "string" && binding.value.trim()
        ? { kind: "config", value: binding.value.trim() }
        : { kind: "missing" };
    }
    return { kind: "secret_ref" };
  }
  const host = hostEnv[CEREBRAS_API_KEY_ENV]?.trim();
  return host ? { kind: "host_env", value: host } : { kind: "missing" };
}

export type CerebrasModelsProbe =
  | { ok: true; modelIds: string[] }
  | {
      ok: false;
      reason: "unauthorized" | "http_error" | "network";
      status?: number;
      detail: string;
    };

export async function fetchCerebrasModelIds(
  apiKey: string,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<CerebrasModelsProbe> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${CEREBRAS_API_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    });
  } catch (err) {
    return {
      ok: false,
      reason: "network",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      reason: "unauthorized",
      status: response.status,
      detail: `HTTP ${response.status}`,
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      reason: "http_error",
      status: response.status,
      detail: `HTTP ${response.status}`,
    };
  }
  // Response body is untrusted; only keep string ids.
  const body = parseObject(await response.json().catch(() => null));
  const data = Array.isArray(body.data) ? body.data : [];
  const modelIds = data
    .map((entry) => parseObject(entry).id)
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    .map((id) => id.trim());
  return { ok: true, modelIds };
}

const MODELS_CACHE_TTL_MS = 10 * 60 * 1000;
let modelsCache: { at: number; models: AdapterModel[] } | null = null;

/**
 * Live model list from the Cerebras API using the host's CEREBRAS_API_KEY.
 * Falls back to the bundled list when no host key is set or the call fails.
 */
export async function listCerebrasModels(
  options: { refresh?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<AdapterModel[]> {
  if (!options.refresh && modelsCache && Date.now() - modelsCache.at < MODELS_CACHE_TTL_MS) {
    return modelsCache.models;
  }
  const apiKey = process.env[CEREBRAS_API_KEY_ENV]?.trim();
  if (!apiKey) return staticModels;
  const probe = await fetchCerebrasModelIds(apiKey, { fetchImpl: options.fetchImpl });
  if (!probe.ok || probe.modelIds.length === 0) return staticModels;
  const labels = new Map(staticModels.map((model) => [model.id, model.label]));
  const live = probe.modelIds.map((id) => {
    const fullId = `${CEREBRAS_PROVIDER}/${id}`;
    return { id: fullId, label: labels.get(fullId) ?? id };
  });
  modelsCache = { at: Date.now(), models: live };
  return live;
}

export function resetCerebrasModelsCacheForTests(): void {
  modelsCache = null;
}
