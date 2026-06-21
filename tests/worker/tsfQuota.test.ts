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

describe("quotaConcurrencyCap", () => {
  it("returns 1 when remaining is below per-call cost", async () => {
    const { quotaConcurrencyCap } = await import("../../worker/src/services/tsfQuota.js");
    expect(quotaConcurrencyCap(100)).toBe(1);
    expect(quotaConcurrencyCap(15000)).toBe(1);
    expect(quotaConcurrencyCap(30000)).toBe(2);
  });
});

describe("resolveQuotaSeedCap", () => {
  it("falls back to redis remaining when query returns failure sentinel", async () => {
    const { resolveQuotaSeedCap } = await import("../../worker/src/services/tsfQuota.js");
    const r = resolveQuotaSeedCap(1, 500_000);
    expect(r.usedFallback).toBe(true);
    expect(r.remaining).toBe(500_000);
    expect(r.cap).toBe(33);
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
