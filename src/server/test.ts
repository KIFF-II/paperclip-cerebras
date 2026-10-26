import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
  AdapterEnvironmentTestStatus,
} from "@paperclipai/adapter-utils";
import { adapterExecutionTargetIsRemote } from "@paperclipai/adapter-utils/execution-target";
import { testEnvironment as testOpenCodeEnvironment } from "@paperclipai/adapter-opencode-local/server";
import { CEREBRAS_API_KEY_ENV, resolveCerebrasModel } from "../models.js";
import { fetchCerebrasModelIds, readCerebrasApiKey } from "./cerebras-api.js";

function summarize(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestStatus {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

async function checkCerebrasAccess(
  ctx: AdapterEnvironmentTestContext,
  bareModel: string,
): Promise<AdapterEnvironmentCheck[]> {
  const apiKey = readCerebrasApiKey(ctx.config);
  const remote = adapterExecutionTargetIsRemote(ctx.executionTarget);

  if (apiKey.kind === "missing") {
    return [{
      code: "cerebras_api_key_missing",
      level: "error",
      message: `${CEREBRAS_API_KEY_ENV} is not configured.`,
      hint: "Create a key at cloud.cerebras.ai and add it to the agent's env as a secret.",
    }];
  }
  if (apiKey.kind === "secret_ref") {
    return [{
      code: "cerebras_api_key_secret_ref",
      level: "info",
      message: `${CEREBRAS_API_KEY_ENV} is bound to a secret; skipping the live Cerebras API check.`,
    }];
  }

  const checks: AdapterEnvironmentCheck[] = [];
  if (apiKey.kind === "host_env") {
    checks.push(remote
      ? {
          code: "cerebras_api_key_host_only",
          level: "error",
          message: `${CEREBRAS_API_KEY_ENV} is only set on the Paperclip host, which remote targets cannot see.`,
          hint: "Bind the key in the agent's env as a secret.",
        }
      : {
          code: "cerebras_api_key_host_env",
          level: "warn",
          message: `Using ${CEREBRAS_API_KEY_ENV} from the Paperclip host environment.`,
          hint: "Bind the key in the agent's env as a secret so the agent keeps working on other hosts.",
        });
  }

  const probe = await fetchCerebrasModelIds(apiKey.value);
  if (!probe.ok) {
    checks.push(probe.reason === "unauthorized"
      ? {
          code: "cerebras_api_key_rejected",
          level: "error",
          message: "Cerebras rejected the API key.",
          detail: probe.detail,
          hint: "Check the key at cloud.cerebras.ai.",
        }
      : {
          code: "cerebras_api_unreachable",
          level: "warn",
          message: "Could not reach the Cerebras API to verify the key.",
          detail: probe.detail,
        });
    return checks;
  }

  checks.push({ code: "cerebras_api_key_valid", level: "info", message: "Cerebras API key accepted." });
  if (probe.modelIds.length > 0 && !probe.modelIds.includes(bareModel)) {
    checks.push({
      code: "cerebras_model_unavailable",
      level: "error",
      message: `Model "${bareModel}" is not available to this Cerebras key.`,
      detail: `Available: ${probe.modelIds.join(", ")}`,
    });
  }
  return checks;
}

export async function testEnvironment(ctx: AdapterEnvironmentTestContext): Promise<AdapterEnvironmentTestResult> {
  const resolved = resolveCerebrasModel(ctx.config.model);
  if (!resolved.ok) {
    const checks: AdapterEnvironmentCheck[] = [{ code: "cerebras_model_invalid", level: "error", message: resolved.error }];
    return { adapterType: ctx.adapterType, status: "fail", checks, testedAt: new Date().toISOString() };
  }

  const checks = await checkCerebrasAccess(ctx, resolved.bareModel);
  // OpenCode's own probes cover the CLI, cwd, model discovery and a hello run.
  const openCode = await testOpenCodeEnvironment({
    ...ctx,
    config: { ...ctx.config, model: resolved.model },
  });
  checks.push(...openCode.checks);

  return {
    adapterType: ctx.adapterType,
    status: summarize(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
