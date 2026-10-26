export const type = "cerebras_local";
export const label = "Cerebras";

export { models, DEFAULT_CEREBRAS_MODEL, resolveCerebrasModel } from "./models.js";

export const agentConfigurationDoc = `# cerebras_local agent configuration

Adapter: cerebras_local

Runs the agent with OpenCode as the harness and Cerebras Inference as the model
provider. OpenCode supplies the coding-agent tools, session resume and skills;
Cerebras supplies fast inference.

Use when:
- You want a Paperclip agent powered by a Cerebras-hosted model
- You want OpenCode's file, shell and edit tools with Cerebras speed

Don't use when:
- You want a non-Cerebras model (use opencode_local)
- OpenCode CLI is not installed on the machine or sandbox

Core fields:
- model (string, optional): Cerebras model id, with or without the "cerebras/" prefix. Defaults to cerebras/gpt-oss-120b
- env.CEREBRAS_API_KEY (string, required): Cerebras API key from cloud.cerebras.ai. Use a secret ref
- cwd (string, optional): default absolute working directory for the agent process
- instructionsFilePath (string, optional): markdown instructions file prepended to the run prompt
- variant (string, optional): reasoning variant passed to OpenCode as --variant (e.g. low|medium|high)
- promptTemplate (string, optional): run prompt template
- dangerouslySkipPermissions (boolean, optional): allow all OpenCode tools without prompts; defaults to true for unattended runs
- command (string, optional): OpenCode binary, defaults to "opencode"
- extraArgs (string[], optional): additional OpenCode CLI args
- env (object, optional): additional KEY=VALUE environment variables

Operational fields:
- timeoutSec (number, optional): run timeout in seconds
- graceSec (number, optional): SIGTERM grace period in seconds

Notes:
- Models other than cerebras/* are rejected.
- The environment test checks the key against the Cerebras API before running OpenCode's own probes.
- Token usage and cost come from OpenCode's run report and are billed to provider "cerebras".
`;

export { createServerAdapter } from "./server/index.js";
