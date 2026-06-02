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

// Mock glossary so no Blob access happens; controllable per-test.
vi.mock("../../worker/src/services/glossary.js", () => ({
  loadGlossaryLines: vi.fn(async () => []),
}));

import { translateBatch } from "../../worker/src/services/llmTranslate.js";
import { tmGet, tmSet } from "../../worker/src/services/translationMemory.js";
import { loadGlossaryLines } from "../../worker/src/services/glossary.js";

function llmResponse(translations: Array<{ key: string; translatedValue: string }>) {
  return { choices: [{ message: { content: JSON.stringify({ translations }) } }] };
}

beforeEach(() => {
  createMock.mockReset();
  vi.mocked(tmGet).mockReset().mockResolvedValue(null);
  vi.mocked(tmSet).mockReset().mockResolvedValue(undefined);
  vi.mocked(loadGlossaryLines).mockReset().mockResolvedValue([]);
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

describe("translateBatch — prompt structure (caching-friendly)", () => {
  it("sends static instructions in system and only the payload in user", async () => {
    createMock.mockResolvedValueOnce(llmResponse([{ key: "title", translatedValue: "Hello" }]));
    await translateBatch(
      [{ key: "title", value: "你好", digest: "d1" }],
      "zh-CN",
      "en",
      "gpt-4o-mini",
      false,
      "shop.myshopify.com",
    );
    const messages = createMock.mock.calls[0][0].messages as Array<{ role: string; content: string }>;
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("professional e-commerce translator");
    expect(messages[0].content).not.toContain("你好"); // variable text must NOT be in the cached prefix
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain("你好");
  });

  it("injects glossary lines into the system prompt", async () => {
    vi.mocked(loadGlossaryLines).mockResolvedValueOnce([`- Translate "闪购" as "Flash Sale".`]);
    createMock.mockResolvedValueOnce(llmResponse([{ key: "title", translatedValue: "Flash Sale" }]));
    await translateBatch(
      [{ key: "title", value: "闪购", digest: "d1" }],
      "zh-CN",
      "en",
      "gpt-4o-mini",
      false,
      "shop.myshopify.com",
    );
    const messages = createMock.mock.calls[0][0].messages as Array<{ role: string; content: string }>;
    expect(messages[0].content).toContain("Glossary");
    expect(messages[0].content).toContain(`Translate "闪购" as "Flash Sale".`);
    expect(loadGlossaryLines).toHaveBeenCalledWith("shop.myshopify.com", "en");
  });
});

describe("translateBatch — HTML entity & whitespace cleanup", () => {
  it("decodes escaped quotes/apostrophes in plain fields", async () => {
    createMock.mockResolvedValueOnce(llmResponse([{ key: "title", translatedValue: `dis &quot;salut&quot; l&#39;ami` }]));
    const out = await translateBatch(
      [{ key: "title", value: "打招呼", digest: "d1" }],
      "zh-CN",
      "fr",
      "gpt-4o-mini",
      false,
      "shop.myshopify.com",
    );
    expect(out[0].translatedValue).toBe(`dis "salut" l'ami`);
  });

  it("does NOT decode &amp; / &lt; / &gt; (keeps HTML well-formed)", async () => {
    createMock.mockResolvedValueOnce(llmResponse([{ key: "title", translatedValue: "Tom &amp; Jerry &lt;3 &gt;" }]));
    const out = await translateBatch(
      [{ key: "title", value: "汤姆", digest: "d1" }],
      "zh-CN",
      "en",
      "gpt-4o-mini",
      false,
      "shop.myshopify.com",
    );
    expect(out[0].translatedValue).toBe("Tom &amp; Jerry &lt;3 &gt;");
  });

  it("trims model-injected whitespace and decodes entities in HTML nodes", async () => {
    // node index "0" is the text "Hello"; model returns it padded + escaped.
    createMock.mockResolvedValueOnce(llmResponse([{ key: "0", translatedValue: `  Bonjour l&#39;ami  ` }]));
    const out = await translateBatch(
      [{ key: "body_html", value: "<p>Hello</p>", digest: "d1" }],
      "zh-CN",
      "fr",
      "gpt-4o-mini",
      false,
      "shop.myshopify.com",
    );
    expect(out[0].translatedValue).toBe(`<p>Bonjour l'ami</p>`);
  });
});

describe("translateBatch — placeholder masking", () => {
  it("masks variables before sending and restores them verbatim", async () => {
    createMock.mockResolvedValueOnce(llmResponse([{ key: "body", translatedValue: "Retourné ⟦0⟧ articles" }]));
    const out = await translateBatch(
      [{ key: "body", value: "Returned {{quantity}} items", digest: "d1" }],
      "zh-CN",
      "fr",
      "gpt-4o-mini",
      false,
      "shop.myshopify.com",
    );
    // The model never saw the real variable...
    const userMsg = createMock.mock.calls[0][0].messages[1].content as string;
    expect(userMsg).toContain("⟦0⟧");
    expect(userMsg).not.toContain("{{quantity}}");
    // ...and it is restored exactly in the output.
    expect(out[0].translatedValue).toBe("Retourné {{quantity}} articles");
  });

  it("masks [bracket] vars but leaves markdown links alone", async () => {
    createMock.mockResolvedValueOnce(llmResponse([{ key: "body", translatedValue: "X ⟦0⟧ Y [docs](url)" }]));
    const out = await translateBatch(
      [{ key: "body", value: "Buy [qty] see [docs](url)", digest: "d1" }],
      "zh-CN",
      "fr",
      "gpt-4o-mini",
      false,
      "shop.myshopify.com",
    );
    const userMsg = createMock.mock.calls[0][0].messages[1].content as string;
    expect(userMsg).toContain("⟦0⟧"); // [qty] masked
    expect(userMsg).toContain("[docs](url)"); // markdown link not masked
    expect(out[0].translatedValue).toBe("X [qty] Y [docs](url)"); // [qty] restored, link intact
  });

  it("falls back to the original if the model corrupts a placeholder sentinel", async () => {
    // Model translated inside the token instead of preserving the sentinel.
    createMock.mockResolvedValue(llmResponse([{ key: "body", translatedValue: "Retourné {{quantité}} articles" }]));
    const out = await translateBatch(
      [{ key: "body", value: "Returned {{quantity}} items", digest: "d1" }],
      "zh-CN",
      "fr",
      "gpt-4o-mini",
      false,
      "shop.myshopify.com",
    );
    expect(out[0].status).toBe("fallback");
    expect(out[0].translatedValue).toBe("Returned {{quantity}} items");
  });
});
