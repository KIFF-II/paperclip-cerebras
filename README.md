# paperclip-adapter-cerebras

A [Paperclip](https://docs.paperclip.ing) external adapter that runs agents on
[Cerebras Inference](https://inference-docs.cerebras.ai).

Cerebras serves models through a chat-completions API, not an agent runtime, so
this adapter uses [OpenCode](https://opencode.ai) as the harness. OpenCode is on
Cerebras's list of [supported integrations](https://inference-docs.cerebras.ai/integrations/opencode).
Under the hood it calls Paperclip's built-in `opencode_local` adapter and pins it
to Cerebras:

| Concern | Handled by |
| --- | --- |
| Agent loop, file/shell/edit tools, session resume, skills | OpenCode via `@paperclipai/adapter-opencode-local` |
| Model list, `cerebras/` prefix, rejecting other providers | this adapter |
| `CEREBRAS_API_KEY` checks and a live Cerebras API probe | this adapter |
| Billing attribution (`provider`/`biller` = `cerebras`, `metered_api`) | this adapter |
| Token usage and cost | OpenCode's run report (models.dev pricing) |

Adapter type: `cerebras_local`.

## Requirements

- Paperclip with external adapter support
- Node.js 24.11 or later
- The `opencode` CLI on the host or sandbox that runs the agent. Sandboxes
  install it automatically through `getRuntimeCommandSpec`.
- A Cerebras API key from [cloud.cerebras.ai](https://cloud.cerebras.ai)

## Install

Build the package, then install it from the Board UI's Adapter Manager or
through the API:

```sh
npm install
npm run build

curl -X POST "$PAPERCLIP_URL/api/adapters/install" \
  -H "Content-Type: application/json" \
  -d '{"packageName": "/absolute/path/to/paperclip-cerebras", "isLocalPath": true}'
```

Once the package is published to npm, pass `"packageName": "paperclip-adapter-cerebras"`
without `isLocalPath`.

## Configure an agent

| Field | Notes |
| --- | --- |
| `model` | `cerebras/gpt-oss-120b` (default) or `cerebras/qwen-3.8-27b`. The `cerebras/` prefix is optional. Other providers are rejected. |
| `env.CEREBRAS_API_KEY` | Required. Bind it as a secret. A key in the Paperclip host's environment works for local runs only, and the environment test warns about it. |
| `variant` | Optional reasoning level (`low`/`medium`/`high`), passed to OpenCode as `--variant`. |

The adapter also accepts all other `opencode_local` fields: `cwd`,
`instructionsFilePath`, `promptTemplate`, `dangerouslySkipPermissions`,
`command`, `extraArgs`, `env`, `timeoutSec` and `graceSec`.

If `CEREBRAS_API_KEY` is set on the Paperclip host, the model picker fetches the
live list from `GET https://api.cerebras.ai/v1/models`. Otherwise it shows the
bundled list.

## Environment test

The environment test runs these checks:

1. The model is a Cerebras model.
2. `CEREBRAS_API_KEY` is present: in config, as a secret binding, or in the host environment.
3. Cerebras accepts the key, and the model is available to it. A network failure is a warning, not an error.
4. OpenCode's own probes pass: CLI on PATH, valid `cwd`, model discovery and a hello run.

## Package layout

```
src/index.ts          metadata: type, label, models, agentConfigurationDoc
src/models.ts         Cerebras model list and normalization
src/server/index.ts   createServerAdapter()
src/server/execute.ts runs through OpenCode, enforces Cerebras
src/server/test.ts    testEnvironment()
src/server/cerebras-api.ts  key lookup and /v1/models probe
src/ui-parser.ts      transcript parser (bundled into dist/ui-parser.js, no imports)
```

## Development

```sh
npm run build      # tsc + esbuild bundle of the UI parser
npm test           # vitest (run build first; the UI parser test uses dist/)
npm run typecheck
```

`@paperclipai/adapter-opencode-local` and `@paperclipai/adapter-utils` are
pinned to the same Paperclip release. Bump them together.
