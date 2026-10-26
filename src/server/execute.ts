import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterInvocationMeta,
} from "@paperclipai/adapter-utils";
import { adapterExecutionTargetIsRemote } from "@paperclipai/adapter-utils/execution-target";
import { asBoolean } from "@paperclipai/adapter-utils/server-utils";
import { execute as executeOpenCode } from "@paperclipai/adapter-opencode-local/server";
import { type } from "../index.js";
import { CEREBRAS_API_KEY_ENV, CEREBRAS_PROVIDER, resolveCerebrasModel } from "../models.js";
import { readCerebrasApiKey } from "./cerebras-api.js";
import { withCerebrasOpenCodeLimits } from "./opencode-config.js";

function configurationFailure(errorMessage: string, model: string | null): AdapterExecutionResult {
  return {
    exitCode: 1,
    signal: null,
    timedOut: false,
    errorMessage,
    errorFamily: "configuration",
    provider: CEREBRAS_PROVIDER,
    biller: CEREBRAS_PROVIDER,
    billingType: "metered_api",
    model,
    clearSession: false,
  };
}

/**
 * Run the agent through OpenCode, pinned to a Cerebras model.
 * OpenCode owns the process, session resume, skills and usage parsing; this
 * wrapper enforces the provider, the key, and Cerebras billing attribution.
 */
export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const resolved = resolveCerebrasModel(ctx.config.model);
  if (!resolved.ok) return configurationFailure(resolved.error, null);

  const apiKey = readCerebrasApiKey(ctx.config);
  if (apiKey.kind === "host_env") {
    // A host key never reaches a remote sandbox implicitly; it must be bound in config.
    if (adapterExecutionTargetIsRemote(ctx.executionTarget)) {
      return configurationFailure(
        `${CEREBRAS_API_KEY_ENV} is only set on the Paperclip host. Bind it in the agent's env (as a secret) to run on a remote target.`,
        resolved.model,
      );
    }
  } else if (apiKey.kind !== "config") {
    return configurationFailure(
      `${CEREBRAS_API_KEY_ENV} is required for cerebras_local. Add it to the agent's env, ideally as a secret.`,
      resolved.model,
    );
  }

  // opencode_local only writes a runtime OpenCode config (and with it the
  // injected limits) when it auto-approves permissions.
  if (!asBoolean(ctx.config.dangerouslySkipPermissions, true)) {
    await ctx.onLog(
      "stderr",
      "[cerebras_local] dangerouslySkipPermissions is off, so Cerebras context and output limits are not applied; OpenCode will use catalog limits.\n",
    );
  }

  const onMeta = ctx.onMeta;
  const result = await executeOpenCode({
    ...ctx,
    config: withCerebrasOpenCodeLimits(
      { ...ctx.config, model: resolved.model },
      resolved.bareModel,
    ),
    onMeta: onMeta
      ? (meta: AdapterInvocationMeta) => onMeta({ ...meta, adapterType: type })
      : undefined,
  });

  return {
    ...result,
    provider: CEREBRAS_PROVIDER,
    biller: CEREBRAS_PROVIDER,
    // OpenCode's billing table does not know Cerebras keys and reports "unknown".
    billingType:
      !result.billingType || result.billingType === "unknown" ? "metered_api" : result.billingType,
  };
}
