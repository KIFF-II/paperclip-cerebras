import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const openCodeTest =
  vi.fn<(ctx: AdapterEnvironmentTestContext) => Promise<AdapterEnvironmentTestResult>>();

vi.mock("@paperclipai/adapter-opencode-local/server", () => ({
  execute: vi.fn(),
  testEnvironment: openCodeTest,
  sessionCodec: {},
  listOpenCodeSkills: vi.fn(),
  syncOpenCodeSkills: vi.fn(),
}));

const { testEnvironment } = await import("../src/server/test.js");

function makeContext(config: Record<string, unknown>): AdapterEnvironmentTestContext {
  return { companyId: "co-1", adapterType: "cerebras_local", config };
}

function mockFetch(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const modelsResponse = () =>
  new Response(
    JSON.stringify({ object: "list", data: [{ id: "gpt-oss-120b" }, { id: "qwen-3.8-27b" }] }),
    { status: 200 },
  );

describe("testEnvironment", () => {
  beforeEach(() => {
    openCodeTest.mockReset();
    openCodeTest.mockResolvedValue({
      adapterType: "cerebras_local",
      status: "pass",
      checks: [{ code: "opencode_command_resolvable", level: "info", message: "ok" }],
      testedAt: new Date().toISOString(),
    });
    vi.stubEnv("CEREBRAS_API_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("passes when the key is accepted and the model is listed", async () => {
    const fetchMock = mockFetch(modelsResponse());

    const result = await testEnvironment(
      makeContext({ model: "gpt-oss-120b", env: { CEREBRAS_API_KEY: "csk-test" } }),
    );

    expect(result.status).toBe("pass");
    expect(result.checks.map((check) => check.code)).toEqual([
      "cerebras_api_key_valid",
      "opencode_command_resolvable",
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cerebras.ai/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer csk-test" }),
      }),
    );
    expect(openCodeTest.mock.calls[0]![0].config.model).toBe("cerebras/gpt-oss-120b");
  });

  it("fails when the key is missing", async () => {
    const fetchMock = mockFetch(modelsResponse());

    const result = await testEnvironment(makeContext({}));

    expect(result.status).toBe("fail");
    expect(result.checks[0]!.code).toBe("cerebras_api_key_missing");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails when Cerebras rejects the key", async () => {
    mockFetch(new Response("unauthorized", { status: 401 }));

    const result = await testEnvironment(makeContext({ env: { CEREBRAS_API_KEY: "csk-bad" } }));

    expect(result.status).toBe("fail");
    expect(result.checks[0]!.code).toBe("cerebras_api_key_rejected");
  });

  it("fails when the model is not available to the key", async () => {
    mockFetch(modelsResponse());

    const result = await testEnvironment(
      makeContext({ model: "cerebras/llama-9", env: { CEREBRAS_API_KEY: "csk-test" } }),
    );

    expect(result.status).toBe("fail");
    expect(result.checks.map((check) => check.code)).toContain("cerebras_model_unavailable");
  });

  it("only warns when the API cannot be reached", async () => {
    mockFetch(new TypeError("fetch failed"));

    const result = await testEnvironment(makeContext({ env: { CEREBRAS_API_KEY: "csk-test" } }));

    expect(result.status).toBe("warn");
    expect(result.checks[0]!.code).toBe("cerebras_api_unreachable");
  });

  it("skips the live probe for unresolved secret bindings", async () => {
    const fetchMock = mockFetch(modelsResponse());

    const result = await testEnvironment(
      makeContext({ env: { CEREBRAS_API_KEY: { type: "secret_ref", secretId: "sec_1" } } }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.checks[0]!.code).toBe("cerebras_api_key_secret_ref");
    expect(result.status).toBe("pass");
  });

  it("warns when the key comes from the host environment", async () => {
    vi.stubEnv("CEREBRAS_API_KEY", "csk-host");
    mockFetch(modelsResponse());

    const result = await testEnvironment(makeContext({}));

    expect(result.status).toBe("warn");
    expect(result.checks[0]!.code).toBe("cerebras_api_key_host_env");
  });

  it("rejects non-Cerebras models without running OpenCode probes", async () => {
    const result = await testEnvironment(makeContext({ model: "openai/gpt-5.5" }));

    expect(result.status).toBe("fail");
    expect(result.checks[0]!.code).toBe("cerebras_model_invalid");
    expect(openCodeTest).not.toHaveBeenCalled();
  });
});
