import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the OpenAI client so no network calls happen.
const createMock = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: createMock } };
  },
}));

// Mock translation memory so cache behaviour is controllable per-test.
vi.mock("../../worker/src/services/translationMemory.js", () => ({
  tmGet: vi.fn(async () => null),
  tmSet: vi.fn(async () => {}),
  tmKey: (s: string, t: string, m: string, d: string) => `tm:v4:${s}:${t}:${m}:${d}`,
}));

import { translateBatch } from "../../worker/src/services/llmTranslate.js";
import { tmGet, tmSet } from "../../worker/src/services/translationMemory.js";

function llmResponse(translations: Array<{ key: string; translatedValue: string }>) {
  return { choices: [{ message: { content: JSON.stringify({ translations }) } }] };
}

beforeEach(() => {
  createMock.mockReset();
  vi.mocked(tmGet).mockReset().mockResolvedValue(null);
  vi.mocked(tmSet).mockReset().mockResolvedValue(undefined);
  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.TRANSLATION_AI_MODEL;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("translateBatch — testMode", () => {
  it("returns originals with status 'translated' and never calls the engine", async () => {
    const out = await translateBatch(
      [{ key: "title", value: "你好", digest: "d1" }],
      "zh-CN",
      "en",
      "gpt-4o-mini",
      true,
      "shop.myshopify.com",
    );
    expect(out).toEqual([
      { key: "title", translatedValue: "你好 - test", digest: "d1", status: "translated" },
    ]);
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("translateBatch — skip fields", () => {
  it("returns handle unchanged without translating", async () => {
    const out = await translateBatch(
      [{ key: "handle", value: "my-handle", digest: "d1" }],
      "zh-CN",
      "en",
      "gpt-4o-mini",
      false,
      "shop.myshopify.com",
    );
    expect(out[0]).toEqual({ key: "handle", translatedValue: "my-handle", digest: "d1", status: "translated" });
    expect(createMock).not.toHaveBeenCalled();
    expect(tmGet).not.toHaveBeenCalled();
  });
});

describe("translateBatch — translation memory", () => {
  it("serves cache hits without calling the engine", async () => {
    vi.mocked(tmGet).mockResolvedValueOnce("Hello (cached)");
    const out = await translateBatch(
      [{ key: "title", value: "你好", digest: "d1" }],
      "zh-CN",
      "en",
      "gpt-4o-mini",
      false,
      "shop.myshopify.com",
    );
    expect(out[0]).toEqual({ key: "title", translatedValue: "Hello (cached)", digest: "d1", status: "translated" });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("caches newly translated fields", async () => {
    createMock.mockResolvedValueOnce(llmResponse([{ key: "title", translatedValue: "Hello" }]));
    await translateBatch(
      [{ key: "title", value: "你好", digest: "d1" }],
      "zh-CN",
      "en",
      "gpt-4o-mini",
      false,
      "shop.myshopify.com",
    );
    expect(tmSet).toHaveBeenCalledWith("shop.myshopify.com", "en", "gpt-4o-mini", "d1", "Hello");
  });
});

describe("translateBatch — retry & fallback", () => {
  it("retries when the model drops a key, then falls back to original", async () => {
    // Every attempt returns no translations → key never resolved.
    createMock.mockResolvedValue(llmResponse([]));
    const out = await translateBatch(
      [{ key: "title", value: "你好", digest: "d1" }],
      "zh-CN",
      "en",
      "gpt-4o-mini",
      false,
      "shop.myshopify.com",
    );
    expect(out[0]).toEqual({ key: "title", translatedValue: "你好", digest: "d1", status: "fallback" });
    // 1 initial + 2 retries
    expect(createMock).toHaveBeenCalledTimes(3);
    // fallbacks must not be cached
    expect(tmSet).not.toHaveBeenCalled();
  });

  it("recovers after a malformed JSON response on the first attempt", async () => {
    createMock
      .mockResolvedValueOnce({ choices: [{ message: { content: "not json{" } }] })
      .mockResolvedValueOnce(llmResponse([{ key: "title", translatedValue: "Hello" }]));
    const out = await translateBatch(
      [{ key: "title", value: "你好", digest: "d1" }],
      "zh-CN",
      "en",
      "gpt-4o-mini",
      false,
      "shop.myshopify.com",
    );
    expect(out[0]).toEqual({ key: "title", translatedValue: "Hello", digest: "d1", status: "translated" });
    expect(createMock).toHaveBeenCalledTimes(2);
  });
});
