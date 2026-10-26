# @kiffcollective/paperclip-cerebras

A [Paperclip](https://docs.paperclip.ing) external adapter that runs agents on
[Cerebras Inference](https://inference-docs.cerebras.ai).

Cerebras serves models through a chat-completions API, not an agent runtime, so
this adapter uses [OpenCode](https://opencode.ai) as the harness. OpenCode is on
Cerebras's list of [supported integrations](https://inference-docs.cerebras.ai/integrations/opencode).
Under the hood it calls Paperclip's built-in `opencode_local` adapter and pins it
to Cerebras:

| Concern                                                               | Handled by                                         |
| --------------------------------------------------------------------- | -------------------------------------------------- |
| Agent loop, file/shell/edit tools, session resume, skills             | OpenCode via `@paperclipai/adapter-opencode-local` |
| Model list, `cerebras/` prefix, rejecting other providers             | this adapter                                       |
| `CEREBRAS_API_KEY` checks and a live Cerebras API probe               | this adapter                                       |
| Billing attribution (`provider`/`biller` = `cerebras`, `metered_api`) | this adapter                                       |
| Token usage and cost                                                  | OpenCode's run report (models.dev pricing)         |

Adapter type: `cerebras_local`.

## Requirements

- Paperclip with external adapter support
- Node.js 24.11 or later
- The `opencode` CLI on the host or sandbox that runs the agent. Sandboxes
  install it automatically through `getRuntimeCommandSpec`.
- A Cerebras API key from [cloud.cerebras.ai](https://cloud.cerebras.ai)

## Install

Install `@kiffcollective/paperclip-cerebras` from the Board UI's Adapter Manager, or
through the API:

```sh
curl -X POST "$PAPERCLIP_URL/api/adapters/install" \
  -H "Content-Type: application/json" \
  -d '{"packageName": "@kiffcollective/paperclip-cerebras"}'
```

To install a local checkout instead, run `npm install && npm run build`, then
pass the absolute path as `packageName` with `"isLocalPath": true`.

## Configure an agent

| Field                  | Notes                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `model`                | `cerebras/gpt-oss-120b` (default) or `cerebras/qwen-3.8-27b`. The `cerebras/` prefix is optional. Other providers are rejected.              |
| `env.CEREBRAS_API_KEY` | Required. Bind it as a secret. A key in the Paperclip host's environment works for local runs only, and the environment test warns about it. |
| `variant`              | Optional reasoning level (`low`/`medium`/`high`), passed to OpenCode as `--variant`.                                                         |
| `tier`                 | `paid` (default) or `free`. Match your Cerebras plan: it sets the context window OpenCode plans around (131K or 65K).                        |
| `maxOutputTokens`      | Max output tokens per request. Defaults to 16384 (paid) or 8192 (free), capped at the plan's maximum.                                        |

The adapter also accepts all other `opencode_local` fields: `cwd`,
`instructionsFilePath`, `promptTemplate`, `dangerouslySkipPermissions`,
`command`, `extraArgs`, `env`, `timeoutSec` and `graceSec`.

If `CEREBRAS_API_KEY` is set on the Paperclip host, the model picker fetches the
live list from `GET https://api.cerebras.ai/v1/models`. Otherwise it shows the
bundled list.

### Cerebras limits

OpenCode reads model limits from the models.dev catalog, which lists Cerebras's
paid-tier limits (131K context, 40,960 output), and asks for the output limit
capped at 32,000 tokens on every request. Cerebras checks each request against
your tokens-per-minute limit using the prompt **plus** the requested max output,
so on the free tier (30K uncached tokens per minute) a single request would
already be over the limit, and on `qwen-3.8-27b`'s developer tier (150K) each
request reserves 32K plus its prompt.

The adapter therefore passes OpenCode a per-model `limit` through
`PAPERCLIP_OPENCODE_PROVIDERS`: the plan's context window from `tier`, and an
output cap from `maxOutputTokens`. Lower the cap for more agent steps per
minute; raise it if long replies get cut off. A `limit` you set yourself for the
model in `PAPERCLIP_OPENCODE_PROVIDERS` takes precedence. OpenCode only applies
injected settings when `dangerouslySkipPermissions` is on (the default); the
environment test warns otherwise.

## Environment test

The environment test runs these checks:

1. The model is a Cerebras model.
2. `CEREBRAS_API_KEY` is present: in config, as a secret binding, or in the host environment.
3. Cerebras accepts the key, and the model is available to it. A network failure is a warning, not an error.
4. The Cerebras limits above will be applied.
5. OpenCode's own probes pass: CLI on PATH, valid `cwd`, model discovery and a hello run.

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

The toolchain is [Vite+](https://viteplus.dev) (`vp`), configured in
`vite.config.ts`. It covers packaging (tsdown), tests (Vitest), linting
(Oxlint, type-aware) and formatting (Oxfmt).

```sh
npm install
npm run build        # vp pack: dist/ for the server, plus a self-contained dist/ui-parser.js
npm run check        # vp check: format, lint and type checks
npm run check:fix    # format and apply lint autofixes
npm test             # vp test (run build first; the UI parser test uses dist/)
```

`@paperclipai/adapter-opencode-local` and `@paperclipai/adapter-utils` are
pinned to the same Paperclip release. Bump them together.

## Releasing

Releases are published by `.github/workflows/release.yml` when a `v*.*.*` tag is
pushed. The workflow builds, checks and tests the package, publishes it to npm,
and creates a GitHub release with generated notes. Versions with a prerelease
suffix (such as `1.2.0-beta.1`) are published under the `next` dist-tag and
marked as prereleases.

```sh
npm version patch          # or minor / major; commits and tags vX.Y.Z
git push --follow-tags
```

CI (`.github/workflows/ci.yml`) runs the same build, check and test steps on
every push to `main` and on every pull request.

### One-time setup: npm and GitHub

The workflow uses npm **trusted publishing**. GitHub Actions proves its identity
to npm with a short-lived OIDC token, so no npm token is stored in GitHub.
npm no longer recommends long-lived publish tokens. It also generates a signed
[provenance attestation](https://docs.npmjs.com/generating-provenance-statements)
for every release automatically, as long as the repository and package are public.

Trusted publishing can't create a new package, so the first version is
published by hand.

1. **Push the repository to GitHub.** The `repository.url` in `package.json`
   must exactly match the GitHub repository (currently
   `github.com/KIFF-II/paperclip-cerebras`) or npm will reject the
   publish. Keep the repository public if you want provenance.

2. **Create the `npm` environment on GitHub.** Go to _Settings → Environments →
   New environment_ and name it `npm`. Optionally add yourself as a required
   reviewer, so each release waits for your approval before it publishes. No
   secrets are needed.

3. **Publish the first version manually.** The package is scoped, so the
   `kiffcollective` organization must exist on npmjs.com and your account must
   be able to publish to it. Log in with 2FA enabled. Then, from a clean checkout:

   ```sh
   npm login
   npm install
   npm publish --access public   # runs build and tests first via prepublishOnly
   ```

   Then tag that commit: `git tag v0.1.0 && git push origin v0.1.0`. The release
   workflow sees that `0.1.0` is already on npm, skips the publish, and creates
   the GitHub release for it.

4. **Add the trusted publisher on npmjs.com.** Go to _Package → Settings →
   Trusted publishing → GitHub Actions_ and fill in:

   | Field                | Value                |
   | -------------------- | -------------------- |
   | Organization or user | `KIFF-II`            |
   | Repository           | `paperclip-cerebras` |
   | Workflow filename    | `release.yml`        |
   | Environment name     | `npm`                |
   | Allowed actions      | `npm publish`        |

   The fields are case-sensitive, and npm only validates them at publish time.
   **The configuration expires if no publish succeeds through it within 48
   hours**, so cut the next release (step 6) soon after saving it. If it
   expires, delete it and add it again.

5. **Lock down token publishing.** In _Package → Settings → Publishing access_,
   choose **Require two-factor authentication and disallow tokens**. Trusted
   publishing keeps working because it doesn't use tokens.

6. **Release.** Run `npm version patch` and then `git push --follow-tags`. Watch the
   _Release_ workflow in the Actions tab.

#### Optional: approve each release on npmjs.com

To require manual approval on npmjs.com for each release, set _Allowed actions_
to `npm stage publish` only. Then change the publish command in `release.yml`
to `npm stage publish`. Each release then waits in npm's staged queue until a
maintainer approves it with 2FA. Without that approval, a compromised
workflow can't publish on its own.

#### Troubleshooting

- **`ENEEDAUTH` / `E404` on publish:** npm rejected the OIDC token exchange,
  and npm doesn't say why on the console. Compare the **Show OIDC claims for
  npm** step's output with the package's trusted publisher settings:
  `repository_owner` and `repository` must match the owner and repository,
  `workflow_ref` must point at `.github/workflows/release.yml`, and
  `environment` must match the environment name (`npm`). All of these are
  case-sensitive. The **Show npm OIDC log on failure** step prints npm's own
  reason. Also check that the configuration hasn't expired (48 hours without a
  successful publish), and that it was saved on this package.
- **Retrying a failed release:** _Re-run jobs_ reuses the workflow file from the
  tagged commit, so it won't pick up workflow fixes. If nothing was published,
  move the tag to the fixed commit instead:
  `git tag -f vX.Y.Z && git push -f origin vX.Y.Z`. If only the npm settings
  changed, re-running the job is enough.
- **Provenance error about the repository:** `repository.url` in `package.json`
  doesn't match the GitHub repository the workflow ran in.
- **Tag/version mismatch:** the workflow refuses to publish when the tag
  (`v1.2.3`) doesn't match `version` in `package.json`. Use `npm version` to
  bump both together.

## License

[Apache-2.0](LICENSE)
