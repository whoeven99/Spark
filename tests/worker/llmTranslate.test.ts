import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const LLM_MODEL = "deepseek-chat";

function llmResponse(translations: Array<{ key: string; translatedValue: string }>) {
  return {
    choices: [{ message: { content: JSON.stringify({ translations }) } }],
    usage: { total_tokens: 10 },
  };
}

beforeEach(() => {
  resetLlmPoolForTests();
  vi.mocked(tmGet).mockReset().mockResolvedValue(null);
  vi.mocked(tmSet).mockReset().mockResolvedValue(undefined);
  vi.mocked(loadGlossaryLines).mockReset().mockResolvedValue([]);
  process.env.DEEPSEEK_API_KEY = "test-key";
  delete process.env.DEEPSEEK_API_KEYS;
  delete process.env.DEEPSEEK_MODEL;
  delete process.env.GOOGLE_TRANSLATE_API_KEY;
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

/** Mock global fetch for DeepSeek and/or Google Translate. */
function mockFetch(options: {
  deepseek?: unknown[];
  google?: Record<string, string>;
  googleError?: boolean;
}) {
  const dsQueue = options.deepseek ? [...options.deepseek] : [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("translation.googleapis.com")) {
      if (options.googleError) throw new Error("google down");
      const body = JSON.parse(String(init?.body)) as { q: string[] };
      const map = options.google ?? {};
      return {
        ok: true,
        json: async () => ({
          data: { translations: body.q.map((t) => ({ translatedText: map[t] ?? `${t}-G` })) },
        }),
      };
    }
    const payload = dsQueue.shift() ?? llmResponse([]);
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function deepSeekCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes("chat/completions"));
}

function llmMessagesFromFetch(fetchMock: ReturnType<typeof vi.fn>) {
  const call = deepSeekCalls(fetchMock)[0];
  const body = JSON.parse(String(call[1]?.body)) as {
    messages: Array<{ role: string; content: string }>;
  };
  return body.messages;
}

describe("translateBatch — testMode", () => {
  it("returns originals with status 'translated' and never calls the engine", async () => {
    const fetchMock = mockFetch({});
    const out = await translateBatch(
      [{ key: "title", value: "你好", digest: "d1" }],
      "zh-CN",
      "en",
      LLM_MODEL,
      true,
      "shop.myshopify.com",
    );
    expect(out).toEqual([
      { key: "title", translatedValue: "你好 - test", digest: "d1", status: "translated" },
    ]);
    expect(deepSeekCalls(fetchMock)).toHaveLength(0);
  });
});

describe("translateBatch — skip fields", () => {
  it("returns handle unchanged without translating", async () => {
    const fetchMock = mockFetch({});
    const out = await translateBatch(
      [{ key: "handle", value: "my-handle", digest: "d1" }],
      "zh-CN",
      "en",
      LLM_MODEL,
      false,
      "shop.myshopify.com",
    );
    expect(out[0]).toEqual({ key: "handle", translatedValue: "my-handle", digest: "d1", status: "translated" });
    expect(deepSeekCalls(fetchMock)).toHaveLength(0);
    expect(tmGet).not.toHaveBeenCalled();
  });
});

describe("translateBatch — translation memory", () => {
  it("serves cache hits without calling the engine", async () => {
    vi.mocked(tmGet).mockResolvedValueOnce("Hello (cached)");
    const fetchMock = mockFetch({});
    const out = await translateBatch(
      [{ key: "title", value: "你好", digest: "d1" }],
      "zh-CN",
      "en",
      LLM_MODEL,
      false,
      "shop.myshopify.com",
    );
    expect(out[0]).toEqual({ key: "title", translatedValue: "Hello (cached)", digest: "d1", status: "translated" });
    expect(deepSeekCalls(fetchMock)).toHaveLength(0);
  });

  it("caches newly translated fields", async () => {
    const fetchMock = mockFetch({ deepseek: [llmResponse([{ key: "f0", translatedValue: "Hello" }])] });
    await translateBatch(
      [{ key: "title", value: "你好", digest: "d1" }],
      "zh-CN",
      "en",
      LLM_MODEL,
      false,
      "shop.myshopify.com",
    );
    expect(tmSet).toHaveBeenCalledWith("shop.myshopify.com", "en", LLM_MODEL, "d1", "Hello");
    expect(deepSeekCalls(fetchMock).length).toBeGreaterThan(0);
  });
});

describe("translateBatch — retry & fallback", () => {
  it("falls back to original when the model returns no translation for a key", async () => {
    const fetchMock = mockFetch({ deepseek: [llmResponse([])] });
    const out = await translateBatch(
      [{ key: "title", value: "你好", digest: "d1" }],
      "zh-CN",
      "en",
      LLM_MODEL,
      false,
      "shop.myshopify.com",
    );
    expect(out[0]).toEqual({ key: "title", translatedValue: "你好", digest: "d1", status: "fallback" });
    expect(deepSeekCalls(fetchMock)).toHaveLength(1);
    expect(tmSet).not.toHaveBeenCalled();
  });

  it("recovers after a malformed JSON response on the first attempt", async () => {
    const fetchMock = mockFetch({
      deepseek: [
        { choices: [{ message: { content: "not json{" } }] },
        llmResponse([{ key: "f0", translatedValue: "Hello" }]),
      ],
    });
    const out = await translateBatch(
      [{ key: "title", value: "你好", digest: "d1" }],
      "zh-CN",
      "en",
      LLM_MODEL,
      false,
      "shop.myshopify.com",
    );
    expect(out[0]).toEqual({ key: "title", translatedValue: "Hello", digest: "d1", status: "translated" });
    expect(deepSeekCalls(fetchMock)).toHaveLength(2);
  });

  it("splits the batch to isolate the item that breaks the JSON", async () => {
    const fetchMock = mockFetch({
      deepseek: [
        { choices: [{ message: { content: "{bad json" } }] },
        llmResponse([{ key: "f0", translatedValue: "A-fr" }]),
        llmResponse([{ key: "f0", translatedValue: "B-fr" }]),
      ],
    });
    const out = await translateBatch(
      [
        { key: "a", value: "甲", digest: "d1" },
        { key: "b", value: "乙", digest: "d2" },
      ],
      "zh-CN",
      "fr",
      LLM_MODEL,
      false,
      "shop.myshopify.com",
    );
    const byKey = Object.fromEntries(out.map((r) => [r.key, r.translatedValue]));
    expect(byKey.a).toBe("A-fr");
    expect(byKey.b).toBe("B-fr");
    expect(deepSeekCalls(fetchMock)).toHaveLength(3);
  });
});

describe("translateBatch — prompt structure (caching-friendly)", () => {
  it("sends static instructions in system and only the payload in user", async () => {
    const fetchMock = mockFetch({ deepseek: [llmResponse([{ key: "f0", translatedValue: "Hello" }])] });
    await translateBatch(
      [{ key: "title", value: "你好", digest: "d1" }],
      "zh-CN",
      "en",
      LLM_MODEL,
      false,
      "shop.myshopify.com",
    );
    const messages = llmMessagesFromFetch(fetchMock);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("professional e-commerce translator");
    expect(messages[0].content).not.toContain("你好");
    expect(messages[0].content).not.toContain("zh-CN");
    expect(messages[0].content).toContain("en");
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain("你好");
  });

  it("injects glossary lines into the system prompt", async () => {
    vi.mocked(loadGlossaryLines).mockResolvedValueOnce([`- Translate "闪购" as "Flash Sale".`]);
    const fetchMock = mockFetch({ deepseek: [llmResponse([{ key: "f0", translatedValue: "Flash Sale" }])] });
    await translateBatch(
      [{ key: "title", value: "闪购", digest: "d1" }],
      "zh-CN",
      "en",
      LLM_MODEL,
      false,
      "shop.myshopify.com",
    );
    const messages = llmMessagesFromFetch(fetchMock);
    expect(messages[0].content).toContain("Glossary");
    expect(messages[0].content).toContain(`Translate "闪购" as "Flash Sale".`);
    expect(loadGlossaryLines).toHaveBeenCalledWith("shop.myshopify.com", "en");
  });
});

describe("translateResources — chunk batching & dedup", () => {
  it("batches fields from multiple resources into one call", async () => {
    const fetchMock = mockFetch({
      deepseek: [
        llmResponse([
          { key: "f0", translatedValue: "A-en" },
          { key: "f1", translatedValue: "B-en" },
        ]),
      ],
    });
    const out = await translateResources(
      [
        { resourceId: "r1", fields: [{ key: "title", value: "甲甲", digest: "d1" }] },
        { resourceId: "r2", fields: [{ key: "title", value: "乙乙", digest: "d2" }] },
      ],
      "zh-CN",
      "en",
      LLM_MODEL,
      false,
      "shop.myshopify.com",
    );
    expect(out.resources[0].results[0].translatedValue).toBe("A-en");
    expect(out.resources[1].results[0].translatedValue).toBe("B-en");
    expect(out.usage[LLM_MODEL].units).toBe(2);
    expect(deepSeekCalls(fetchMock)).toHaveLength(1);
    const payload = JSON.parse(llmMessagesFromFetch(fetchMock)[1].content);
    expect(payload).toHaveLength(2);
  });

  it("dedups identical text across resources (translated once, reused)", async () => {
    const fetchMock = mockFetch({ deepseek: [llmResponse([{ key: "f0", translatedValue: "Once" }])] });
    const out = await translateResources(
      [
        { resourceId: "r1", fields: [{ key: "title", value: "重复", digest: "d1" }] },
        { resourceId: "r2", fields: [{ key: "title", value: "重复", digest: "d2" }] },
        { resourceId: "r3", fields: [{ key: "title", value: "重复", digest: "d3" }] },
      ],
      "zh-CN",
      "en",
      LLM_MODEL,
      false,
      "shop.myshopify.com",
    );
    expect(out.resources.map((r) => r.results[0].translatedValue)).toEqual(["Once", "Once", "Once"]);
    const payload = JSON.parse(llmMessagesFromFetch(fetchMock)[1].content);
    expect(payload).toHaveLength(1);
    expect(out.usage[LLM_MODEL].units).toBe(1);
  });

  it("calls onResourceDone once per resource as each finishes", async () => {
    mockFetch({
      deepseek: [
        llmResponse([{ key: "f0", translatedValue: "A-en" }]),
        llmResponse([{ key: "f0", translatedValue: "B-en" }]),
      ],
    });
    let doneCount = 0;
    await translateResources(
      [
        { resourceId: "r1", fields: [{ key: "title", value: "甲甲", digest: "d1" }] },
        { resourceId: "r2", fields: [{ key: "title", value: "乙乙", digest: "d2" }] },
      ],
      "zh-CN",
      "en",
      LLM_MODEL,
      false,
      "shop.myshopify.com",
      undefined,
      async () => {
        doneCount++;
      },
    );
    expect(doneCount).toBe(2);
  });

  it("attributes usage to each engine in a mixed chunk", async () => {
    process.env.GOOGLE_TRANSLATE_API_KEY = "gk";
    const fetchMock = mockFetch({
      google: { "短": "Short-G" },
      deepseek: [llmResponse([{ key: "f0", translatedValue: "Body-LLM" }])],
    });
    const out = await translateResources(
      [
        {
          resourceId: "r1",
          fields: [
            { key: "title", value: "短", digest: "d1" },
            { key: "body_html", value: "<p>你好世界</p>", digest: "d2" },
          ],
        },
      ],
      "zh-CN",
      "en",
      LLM_MODEL,
      false,
      "shop.myshopify.com",
    );
    expect(out.usage["google-translate"].units).toBe(1);
    expect(out.usage[LLM_MODEL].units).toBe(1);
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe("translateBatch — cost-tiered engine routing", () => {
  it("routes short/simple fields to Google", async () => {
    process.env.GOOGLE_TRANSLATE_API_KEY = "gk";
    const fetchMock = mockFetch({ google: { "你好": "Hello-G" } });
    const out = await translateBatch(
      [{ key: "title", value: "你好", digest: "d1" }],
      "zh-CN",
      "en",
      LLM_MODEL,
      false,
      "shop.myshopify.com",
    );
    expect(out[0].translatedValue).toBe("Hello-G");
    expect(fetchMock.mock.calls.some(([url]) => url.includes("translation.googleapis.com"))).toBe(true);
    expect(deepSeekCalls(fetchMock)).toHaveLength(0);
    const googleCall = fetchMock.mock.calls.find(([url]) => url.includes("translation.googleapis.com"));
    const gBody = JSON.parse(String((googleCall![1] as { body?: string }).body));
    expect(gBody.source).toBeUndefined();
    expect(gBody.target).toBe("en");
  });

  it("routes rich content (HTML) to the LLM", async () => {
    process.env.GOOGLE_TRANSLATE_API_KEY = "gk";
    const fetchMock = mockFetch({ deepseek: [llmResponse([{ key: "f0", translatedValue: "Bonjour" }])] });
    const out = await translateBatch(
      [{ key: "body_html", value: "<p>Hello</p>", digest: "d1" }],
      "zh-CN",
      "fr",
      LLM_MODEL,
      false,
      "shop.myshopify.com",
    );
    expect(out[0].translatedValue).toBe("<p>Bonjour</p>");
    expect(deepSeekCalls(fetchMock).length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.some(([url]) => url.includes("translation.googleapis.com"))).toBe(false);
  });

  it("falls back to the LLM when Google fails", async () => {
    process.env.GOOGLE_TRANSLATE_API_KEY = "gk";
    const fetchMock = mockFetch({
      googleError: true,
      deepseek: [llmResponse([{ key: "f0", translatedValue: "Hello-LLM" }])],
    });
    const out = await translateBatch(
      [{ key: "title", value: "你好", digest: "d1" }],
      "zh-CN",
      "en",
      LLM_MODEL,
      false,
      "shop.myshopify.com",
    );
    expect(fetchMock.mock.calls.some(([url]) => url.includes("translation.googleapis.com"))).toBe(true);
    expect(deepSeekCalls(fetchMock).length).toBeGreaterThan(0);
    expect(out[0].translatedValue).toBe("Hello-LLM");
  });
});

describe("translateBatch — DeepSeek provider", () => {
  it("calls DeepSeek native fetch with DEEPSEEK_MODEL", async () => {
    process.env.DEEPSEEK_MODEL = "deepseek-v4-flash";
    resetLlmPoolForTests();

    const fetchMock = mockFetch({
      deepseek: [
        {
          ...llmResponse([{ key: "f0", translatedValue: "Bonjour" }]),
          usage: { total_tokens: 42, prompt_tokens: 10, completion_tokens: 32 },
        },
      ],
    });

    await translateBatch(
      [{ key: "title", value: "你好", digest: "d1" }],
      "zh-CN",
      "fr",
      LLM_MODEL,
      false,
      "shop.myshopify.com",
    );

    expect(deepSeekCalls(fetchMock)).toHaveLength(1);
    expect(deepSeekCalls(fetchMock)[0][0]).toBe("https://api.deepseek.com/chat/completions");
    const body = JSON.parse(String(deepSeekCalls(fetchMock)[0][1]?.body)) as {
      model: string;
      response_format: { type: string };
      user_id: string;
    };
    expect(body.model).toBe("deepseek-v4-flash");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.user_id).toBe("shop_myshopify_com");
  });
});

describe("translateBatch — HTML entity & whitespace cleanup", () => {
  it("decodes escaped quotes/apostrophes in plain fields", async () => {
    mockFetch({ deepseek: [llmResponse([{ key: "f0", translatedValue: `dis &quot;salut&quot; l&#39;ami` }])] });
    const out = await translateBatch(
      [{ key: "title", value: "打招呼", digest: "d1" }],
      "zh-CN",
      "fr",
      LLM_MODEL,
      false,
      "shop.myshopify.com",
    );
    expect(out[0].translatedValue).toBe(`dis "salut" l'ami`);
  });

  it("does NOT decode &amp; / &lt; / &gt; (keeps HTML well-formed)", async () => {
    mockFetch({ deepseek: [llmResponse([{ key: "f0", translatedValue: "Tom &amp; Jerry &lt;3 &gt;" }])] });
    const out = await translateBatch(
      [{ key: "title", value: "汤姆", digest: "d1" }],
      "zh-CN",
      "en",
      LLM_MODEL,
      false,
      "shop.myshopify.com",
    );
    expect(out[0].translatedValue).toBe("Tom &amp; Jerry &lt;3 &gt;");
  });

  it("trims model-injected whitespace and decodes entities in HTML nodes", async () => {
    mockFetch({ deepseek: [llmResponse([{ key: "f0", translatedValue: `  Bonjour l&#39;ami  ` }])] });
    const out = await translateBatch(
      [{ key: "body_html", value: "<p>Hello</p>", digest: "d1" }],
      "zh-CN",
      "fr",
      LLM_MODEL,
      false,
      "shop.myshopify.com",
    );
    expect(out[0].translatedValue).toBe(`<p>Bonjour l'ami</p>`);
  });
});

describe("translateBatch — placeholder masking", () => {
  it("masks variables before sending and restores them verbatim", async () => {
    const fetchMock = mockFetch({ deepseek: [llmResponse([{ key: "f0", translatedValue: "Retourné ⟦0⟧ articles" }])] });
    const out = await translateBatch(
      [{ key: "body", value: "Returned {{quantity}} items", digest: "d1" }],
      "zh-CN",
      "fr",
      LLM_MODEL,
      false,
      "shop.myshopify.com",
    );
    const userMsg = llmMessagesFromFetch(fetchMock)[1].content;
    expect(userMsg).toContain("⟦0⟧");
    expect(userMsg).not.toContain("{{quantity}}");
    expect(out[0].translatedValue).toBe("Retourné {{quantity}} articles");
  });

  it("masks [bracket] vars but leaves markdown links alone", async () => {
    const fetchMock = mockFetch({ deepseek: [llmResponse([{ key: "f0", translatedValue: "X ⟦0⟧ Y [docs](url)" }])] });
    const out = await translateBatch(
      [{ key: "body", value: "Buy [qty] see [docs](url)", digest: "d1" }],
      "zh-CN",
      "fr",
      LLM_MODEL,
      false,
      "shop.myshopify.com",
    );
    const userMsg = llmMessagesFromFetch(fetchMock)[1].content;
    expect(userMsg).toContain("⟦0⟧");
    expect(userMsg).toContain("[docs](url)");
    expect(out[0].translatedValue).toBe("X [qty] Y [docs](url)");
  });

  it("falls back to the original if the model corrupts a placeholder sentinel", async () => {
    mockFetch({ deepseek: [llmResponse([{ key: "f0", translatedValue: "Retourné {{quantité}} articles" }])] });
    const out = await translateBatch(
      [{ key: "body", value: "Returned {{quantity}} items", digest: "d1" }],
      "zh-CN",
      "fr",
      LLM_MODEL,
      false,
      "shop.myshopify.com",
    );
    expect(out[0].status).toBe("fallback");
    expect(out[0].translatedValue).toBe("Returned {{quantity}} items");
  });
});
