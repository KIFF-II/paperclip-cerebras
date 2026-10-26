import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const openCodeExecute = vi.fn<(ctx: AdapterExecutionContext) => Promise<AdapterExecutionResult>>();

vi.mock("@paperclipai/adapter-opencode-local/server", () => ({
  execute: openCodeExecute,
  testEnvironment: vi.fn(),
  sessionCodec: {},
  listOpenCodeSkills: vi.fn(),
  syncOpenCodeSkills: vi.fn(),
}));

const { execute } = await import("../src/server/execute.js");

function makeContext(
  config: Record<string, unknown>,
  overrides: Partial<AdapterExecutionContext> = {},
): AdapterExecutionContext {
  return {
    runId: "run-1",
    agent: {
      id: "agent-1",
      companyId: "co-1",
      name: "Builder",
      adapterType: "cerebras_local",
      adapterConfig: config,
    },
    runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
    config,
    context: {},
    onLog: vi.fn(async () => {}),
    ...overrides,
  };
}

const okResult: AdapterExecutionResult = {
  exitCode: 0,
  signal: null,
  timedOut: false,
  provider: "cerebras",
  biller: "cerebras",
  billingType: "unknown",
  usage: { inputTokens: 100, outputTokens: 20 },
  costUsd: 0.0001,
  sessionParams: { sessionId: "ses_1" },
};

describe("execute", () => {
  beforeEach(() => {
    openCodeExecute.mockReset();
    openCodeExecute.mockResolvedValue(okResult);
    vi.stubEnv("CEREBRAS_API_KEY", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("delegates to OpenCode with a cerebras/ model and attributes billing to Cerebras", async () => {
    const result = await execute(
      makeContext({ model: "qwen-3.8-27b", env: { CEREBRAS_API_KEY: "csk-test" } }),
    );

    expect(openCodeExecute).toHaveBeenCalledOnce();
    const passed = openCodeExecute.mock.calls[0]![0];
    expect(passed.config.model).toBe("cerebras/qwen-3.8-27b");
    expect(passed.config.env).toEqual({ CEREBRAS_API_KEY: "csk-test" });
    expect(result).toMatchObject({
      exitCode: 0,
      provider: "cerebras",
      biller: "cerebras",
      billingType: "metered_api",
      costUsd: 0.0001,
    });
    expect(result.sessionParams).toEqual({ sessionId: "ses_1" });
  });

  it("rewrites invocation meta to the cerebras_local adapter type", async () => {
    openCodeExecute.mockImplementation(async (ctx) => {
      await ctx.onMeta?.({ adapterType: "opencode_local", command: "opencode" });
      return okResult;
    });
    const onMeta = vi.fn(async () => {});

    await execute(makeContext({ env: { CEREBRAS_API_KEY: "csk-test" } }, { onMeta }));

    expect(onMeta).toHaveBeenCalledWith({ adapterType: "cerebras_local", command: "opencode" });
  });

  it("fails with a configuration error when no key is available", async () => {
    const result = await execute(makeContext({ model: "gpt-oss-120b" }));

    expect(openCodeExecute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ exitCode: 1, errorFamily: "configuration" });
    expect(result.errorMessage).toContain("CEREBRAS_API_KEY");
  });

  it("refuses non-Cerebras models", async () => {
    const result = await execute(
      makeContext({ model: "openai/gpt-5.5", env: { CEREBRAS_API_KEY: "csk-test" } }),
    );

    expect(openCodeExecute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ exitCode: 1, errorFamily: "configuration" });
  });

  it("allows a host key for local runs", async () => {
    vi.stubEnv("CEREBRAS_API_KEY", "csk-host");

    const result = await execute(makeContext({}));

    expect(openCodeExecute).toHaveBeenCalledOnce();
    expect(result.exitCode).toBe(0);
  });

  it("does not let a host-only key stand in for a remote target", async () => {
    vi.stubEnv("CEREBRAS_API_KEY", "csk-host");
    const executionTarget = {
      kind: "remote",
      transport: "ssh",
    } as unknown as AdapterExecutionContext["executionTarget"];

    const result = await execute(makeContext({}, { executionTarget }));

    expect(openCodeExecute).not.toHaveBeenCalled();
    expect(result.errorMessage).toContain("remote target");
  });

  it("keeps a billing type OpenCode already determined", async () => {
    openCodeExecute.mockResolvedValue({ ...okResult, billingType: "credits" });

    const result = await execute(makeContext({ env: { CEREBRAS_API_KEY: "csk-test" } }));

    expect(result.billingType).toBe("credits");
  });
});
