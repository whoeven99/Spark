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
  tmGetByValue: vi.fn(async () => null),
  tmSet: vi.fn(async () => {}),
  tmSetByValue: vi.fn(async () => {}),
  tmKey: (s: string, t: string, m: string, d: string) => `tm:v4:${s}:${t}:${m}:${d}`,
}));

// Mock glossary so no Blob access happens; controllable per-test.
vi.mock("../../worker/src/services/glossary.js", () => ({
  loadGlossaryLines: vi.fn(async () => []),
}));

import {
  resetLlmPoolForTests,
  translateBatch,
  translateResources,
} from "../../worker/src/services/llmTranslate.js";
import { tmGet, tmSet } from "../../worker/src/services/translationMemory.js";
import { loadGlossaryLines } from "../../worker/src/services/glossary.js";

function llmResponse(translations: Array<{ key: string; translatedValue: string }>) {
  return { choices: [{ message: { content: JSON.stringify({ translations }) } }] };
}

beforeEach(() => {
  createMock.mockReset();
  resetLlmPoolForTests();
  vi.mocked(tmGet).mockReset().mockResolvedValue(null);
  vi.mocked(tmSet).mockReset().mockResolvedValue(undefined);
  vi.mocked(loadGlossaryLines).mockReset().mockResolvedValue([]);
  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.TRANSLATION_AI_MODEL;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEYS;
  delete process.env.DEEPSEEK_MODEL;
  delete process.env.AZURE_OPENAI_ENDPOINT;
  delete process.env.GOOGLE_TRANSLATE_API_KEY;
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

/** Mock global fetch for Google Translate; returns `<text>-G` unless mapped. */
function mockGoogleFetch(map: Record<string, string> = {}) {
  const f = vi.fn(async (_url: string, init?: { body?: string }) => {
    const body = JSON.parse(String(init?.body)) as { q: string[] };
    return {
      ok: true,
      json: async () => ({ data: { translations: body.q.map((t) => ({ translatedText: map[t] ?? `${t}-G` })) } }),
    };
  });
  vi.stubGlobal("fetch", f);
  return f;
}

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
    createMock.mockResolvedValueOnce(llmResponse([{ key: "0", translatedValue: "Hello" }]));
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
  it("falls back to original when the model returns no translation for a key", async () => {
    // Valid JSON but empty translations → key never resolved (no point retrying a
    // single deterministic item, so it is not re-sent).
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
    expect(createMock).toHaveBeenCalledTimes(1);
    // fallbacks must not be cached
    expect(tmSet).not.toHaveBeenCalled();
  });

  it("recovers after a malformed JSON response on the first attempt", async () => {
    createMock
      .mockResolvedValueOnce({ choices: [{ message: { content: "not json{" } }] })
      .mockResolvedValueOnce(llmResponse([{ key: "0", translatedValue: "Hello" }]));
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

  it("splits the batch to isolate the item that breaks the JSON", async () => {
    createMock
      .mockResolvedValueOnce({ choices: [{ message: { content: "{bad json" } }] }) // whole batch → throw
      .mockResolvedValueOnce(llmResponse([{ key: "0", translatedValue: "A-fr" }])) // split → unique text 甲
      .mockResolvedValueOnce(llmResponse([{ key: "1", translatedValue: "B-fr" }])); // split → unique text 乙
    const out = await translateBatch(
      [
        { key: "a", value: "甲", digest: "d1" },
        { key: "b", value: "乙", digest: "d2" },
      ],
      "zh-CN",
      "fr",
      "gpt-4o-mini",
      false,
      "shop.myshopify.com",
    );
    const byKey = Object.fromEntries(out.map((r) => [r.key, r.translatedValue]));
    expect(byKey.a).toBe("A-fr");
    expect(byKey.b).toBe("B-fr");
    expect(createMock).toHaveBeenCalledTimes(3); // 1 failed batch + 2 singles
  });
});

describe("translateBatch — prompt structure (caching-friendly)", () => {
  it("sends static instructions in system and only the payload in user", async () => {
    createMock.mockResolvedValueOnce(llmResponse([{ key: "0", translatedValue: "Hello" }]));
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
    // Source language is auto-detected, not hardcoded; only the target appears.
    expect(messages[0].content).not.toContain("zh-CN");
    expect(messages[0].content).toContain("en");
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain("你好");
  });

  it("injects glossary lines into the system prompt", async () => {
    vi.mocked(loadGlossaryLines).mockResolvedValueOnce([`- Translate "闪购" as "Flash Sale".`]);
    createMock.mockResolvedValueOnce(llmResponse([{ key: "0", translatedValue: "Flash Sale" }]));
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

describe("translateResources — chunk batching & dedup", () => {
  it("batches fields from multiple resources into one call", async () => {
    createMock.mockResolvedValueOnce(
      llmResponse([
        { key: "0", translatedValue: "A-en" },
        { key: "1", translatedValue: "B-en" },
      ]),
    );
    const out = await translateResources(
      [
        { resourceId: "r1", fields: [{ key: "title", value: "甲甲", digest: "d1" }] },
        { resourceId: "r2", fields: [{ key: "title", value: "乙乙", digest: "d2" }] },
      ],
      "zh-CN",
      "en",
      "gpt-4o-mini",
      false,
      "shop.myshopify.com",
    );
    expect(out.resources[0].results[0].translatedValue).toBe("A-en");
    expect(out.resources[1].results[0].translatedValue).toBe("B-en");
    // usage attributed to the LLM model: 2 units
    expect(out.usage["gpt-4o-mini"].units).toBe(2);
    expect(createMock).toHaveBeenCalledTimes(1); // both resources in one call
    const payload = JSON.parse(createMock.mock.calls[0][0].messages[1].content as string);
    expect(payload).toHaveLength(2);
  });

  it("dedups identical text across resources (translated once, reused)", async () => {
    createMock.mockResolvedValueOnce(llmResponse([{ key: "0", translatedValue: "Once" }]));
    const out = await translateResources(
      [
        { resourceId: "r1", fields: [{ key: "title", value: "重复", digest: "d1" }] },
        { resourceId: "r2", fields: [{ key: "title", value: "重复", digest: "d2" }] },
        { resourceId: "r3", fields: [{ key: "title", value: "重复", digest: "d3" }] },
      ],
      "zh-CN",
      "en",
      "gpt-4o-mini",
      false,
      "shop.myshopify.com",
    );
    expect(out.resources.map((r) => r.results[0].translatedValue)).toEqual(["Once", "Once", "Once"]);
    const payload = JSON.parse(createMock.mock.calls[0][0].messages[1].content as string);
    expect(payload).toHaveLength(1); // 3 occurrences → 1 unique unit sent
    expect(out.usage["gpt-4o-mini"].units).toBe(1); // deduped: counted once
  });

  it("attributes usage to each engine in a mixed chunk", async () => {
    process.env.GOOGLE_TRANSLATE_API_KEY = "gk";
    mockGoogleFetch({ "短": "Short-G" });
    createMock.mockResolvedValueOnce(llmResponse([{ key: "0", translatedValue: "Body-LLM" }]));
    const out = await translateResources(
      [
        {
          resourceId: "r1",
          fields: [
            { key: "title", value: "短", digest: "d1" }, // trivial → Google
            { key: "body_html", value: "<p>Hello</p>", digest: "d2" }, // rich → LLM
          ],
        },
      ],
      "zh-CN",
      "en",
      "gpt-4o-mini",
      false,
      "shop.myshopify.com",
    );
    expect(out.usage["google-translate"].units).toBe(1);
    expect(out.usage["gpt-4o-mini"].units).toBe(1);
  });
});

describe("translateBatch — cost-tiered engine routing", () => {
  it("routes short/simple fields to Google", async () => {
    process.env.GOOGLE_TRANSLATE_API_KEY = "gk"; // both engines available
    const f = mockGoogleFetch({ "你好": "Hello-G" });
    const out = await translateBatch(
      [{ key: "title", value: "你好", digest: "d1" }],
      "zh-CN",
      "en",
      "gpt-4o-mini",
      false,
      "shop.myshopify.com",
    );
    expect(out[0].translatedValue).toBe("Hello-G");
    expect(f).toHaveBeenCalled(); // Google used
    expect(createMock).not.toHaveBeenCalled(); // LLM not used
    // Google request omits `source` (auto-detect) but sets target.
    const gBody = JSON.parse(String((f.mock.calls[0][1] as { body?: string }).body));
    expect(gBody.source).toBeUndefined();
    expect(gBody.target).toBe("en");
  });

  it("routes rich content (HTML) to the LLM", async () => {
    process.env.GOOGLE_TRANSLATE_API_KEY = "gk";
    const f = mockGoogleFetch();
    createMock.mockResolvedValueOnce(llmResponse([{ key: "0", translatedValue: "Bonjour" }]));
    const out = await translateBatch(
      [{ key: "body_html", value: "<p>Hello</p>", digest: "d1" }],
      "zh-CN",
      "fr",
      "gpt-4o-mini",
      false,
      "shop.myshopify.com",
    );
    expect(out[0].translatedValue).toBe("<p>Bonjour</p>");
    expect(createMock).toHaveBeenCalled(); // LLM used
    expect(f).not.toHaveBeenCalled(); // Google not used
  });

  it("falls back to the LLM when Google fails", async () => {
    process.env.GOOGLE_TRANSLATE_API_KEY = "gk";
    const f = vi.fn(async () => {
      throw new Error("google down");
    });
    vi.stubGlobal("fetch", f);
    createMock.mockResolvedValueOnce(llmResponse([{ key: "0", translatedValue: "Hello-LLM" }]));
    const out = await translateBatch(
      [{ key: "title", value: "你好", digest: "d1" }],
      "zh-CN",
      "en",
      "gpt-4o-mini",
      false,
      "shop.myshopify.com",
    );
    expect(f).toHaveBeenCalled(); // Google attempted (primary for short field)
    expect(createMock).toHaveBeenCalled(); // cascaded to LLM
    expect(out[0].translatedValue).toBe("Hello-LLM");
  });
});

describe("translateBatch — provider selection", () => {
  it("calls DeepSeek native fetch when TRANSLATION_AI_MODEL=deepseek", async () => {
    process.env.DEEPSEEK_API_KEY = "dk-test";
    process.env.DEEPSEEK_MODEL = "deepseek-v4-flash";
    process.env.TRANSLATION_AI_MODEL = "deepseek";
    resetLlmPoolForTests();

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      headers: new Headers({
        "x-ratelimit-limit": "500",
        "x-ratelimit-remaining": "499",
        "x-ratelimit-reset": "1710000000",
      }),
      json: async () => ({
        ...llmResponse([{ key: "f0", translatedValue: "Bonjour" }]),
        usage: { total_tokens: 42, prompt_tokens: 10, completion_tokens: 32 },
      }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);

    await translateBatch(
      [{ key: "title", value: "你好", digest: "d1" }],
      "zh-CN",
      "fr",
      "gpt-4o-mini",
      false,
      "shop.myshopify.com",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.deepseek.com/chat/completions");
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      model: string;
      response_format: { type: string };
      user_id: string;
    };
    expect(body.model).toBe("deepseek-v4-flash");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.user_id).toBe("shop_myshopify_com");
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("translateBatch — HTML entity & whitespace cleanup", () => {
  it("decodes escaped quotes/apostrophes in plain fields", async () => {
    createMock.mockResolvedValueOnce(llmResponse([{ key: "0", translatedValue: `dis &quot;salut&quot; l&#39;ami` }]));
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
    createMock.mockResolvedValueOnce(llmResponse([{ key: "0", translatedValue: "Tom &amp; Jerry &lt;3 &gt;" }]));
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
    createMock.mockResolvedValueOnce(llmResponse([{ key: "0", translatedValue: "Retourné ⟦0⟧ articles" }]));
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
    createMock.mockResolvedValueOnce(llmResponse([{ key: "0", translatedValue: "X ⟦0⟧ Y [docs](url)" }]));
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
    createMock.mockResolvedValue(llmResponse([{ key: "0", translatedValue: "Retourné {{quantité}} articles" }]));
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
