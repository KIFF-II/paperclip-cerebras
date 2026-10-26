import type {
  AdapterConfigSchema,
  AdapterSkillContext,
  ServerAdapterModule,
} from "@paperclipai/adapter-utils";
import { asString } from "@paperclipai/adapter-utils/server-utils";
import { SANDBOX_INSTALL_COMMAND } from "@paperclipai/adapter-opencode-local";
import {
  listOpenCodeSkills,
  sessionCodec,
  syncOpenCodeSkills,
} from "@paperclipai/adapter-opencode-local/server";
import { agentConfigurationDoc, type } from "../index.js";
import { DEFAULT_CEREBRAS_MODEL, models } from "../models.js";
import { listCerebrasModels } from "./cerebras-api.js";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";

export { execute } from "./execute.js";
export { testEnvironment } from "./test.js";
export { sessionCodec };

export async function listSkills(ctx: AdapterSkillContext) {
  return { ...(await listOpenCodeSkills(ctx)), adapterType: type };
}

export async function syncSkills(ctx: AdapterSkillContext, desiredSkills: string[]) {
  return { ...(await syncOpenCodeSkills(ctx, desiredSkills)), adapterType: type };
}

export async function getConfigSchema(): Promise<AdapterConfigSchema> {
  const available = await listCerebrasModels();
  return {
    fields: [
      {
        key: "model",
        label: "Cerebras model",
        type: "combobox",
        default: DEFAULT_CEREBRAS_MODEL,
        options: available.map((model) => ({
          value: model.id,
          label: model.label,
          group: "Cerebras",
        })),
        hint: "Cerebras model id. The cerebras/ prefix is added if you leave it out.",
      },
      {
        key: "variant",
        label: "Reasoning variant",
        type: "select",
        options: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
        ],
        hint: "Optional. Passed to OpenCode as --variant for reasoning models such as gpt-oss-120b.",
      },
    ],
  };
}

export function createServerAdapter(): ServerAdapterModule {
  return {
    type,
    execute,
    testEnvironment,
    sessionCodec,
    listSkills,
    syncSkills,
    models,
    listModels: () => listCerebrasModels(),
    refreshModels: () => listCerebrasModels({ refresh: true }),
    agentConfigurationDoc,
    getConfigSchema,
    supportsInstructionsBundle: true,
    getRuntimeCommandSpec: (config) => {
      const command = asString(config.command, "opencode").trim() || "opencode";
      return { command, detectCommand: command, installCommand: SANDBOX_INSTALL_COMMAND };
    },
  };
}
