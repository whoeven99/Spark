import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("tsfQuota URL normalization", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.TSF_SERVER_URL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prepends https:// when TSF_SERVER_URL has no scheme", async () => {
    process.env.TSF_SERVER_URL =
      "springbackendservice-e3hgbjgqafb9cpdh.canadacentral-01.azurewebsites.net";

    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        success: true,
        response: { shopName: "test.myshopify.com", maxToken: 100, usedToken: 0, remaining: 100 },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { getTsfRemaining } = await import("../../worker/src/services/tsfQuota.js");
    await getTsfRemaining("test.myshopify.com");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://springbackendservice-e3hgbjgqafb9cpdh.canadacentral-01.azurewebsites.net/quota/query?shopName=test.myshopify.com",
      { method: "GET" },
    );
  });
});

describe("llmTimeoutMsForBatch", () => {
  beforeEach(() => {
    delete process.env.TRANSLATE_LLM_TIMEOUT_MS;
    delete process.env.TRANSLATE_LLM_TIMEOUT_PER_ITEM_MS;
    delete process.env.TRANSLATE_LLM_TIMEOUT_MAX_MS;
  });

  it("scales timeout with batch item count", async () => {
    vi.resetModules();
    const { llmTimeoutMsForBatch } = await import("../../worker/src/services/llmTranslate.js");
    expect(llmTimeoutMsForBatch(1)).toBe(120_000);
    expect(llmTimeoutMsForBatch(25)).toBe(168_000);
    expect(llmTimeoutMsForBatch(87)).toBe(292_000);
  });
});
