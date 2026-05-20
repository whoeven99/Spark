import { afterEach, describe, expect, it, vi } from "vitest";
import { isOpenAiImageConfigured } from "../../../../app/server/imageGeneration/openAiImageGenerate.server";

describe("openAiImageGenerate config", () => {
  const prev: Record<string, string | undefined> = {};

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of Object.keys(prev)) {
      const v = prev[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
  });

  function setEnv(key: string, value: string | undefined) {
    if (!(key in prev)) prev[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  it("is configured when OPENAI_IMAGE_API_KEY is set", () => {
    setEnv("OPENAI_IMAGE_API_KEY", "test-key");
    setEnv("OPENAI_API_KEY", undefined);
    expect(isOpenAiImageConfigured()).toBe(true);
  });

  it("falls back to OPENAI_API_KEY", () => {
    setEnv("OPENAI_IMAGE_API_KEY", undefined);
    setEnv("OPENAI_API_KEY", "fallback-key");
    expect(isOpenAiImageConfigured()).toBe(true);
  });

  it("is not configured without any key", () => {
    setEnv("OPENAI_IMAGE_API_KEY", undefined);
    setEnv("OPENAI_API_KEY", undefined);
    expect(isOpenAiImageConfigured()).toBe(false);
  });

  it("does not double-append /images/generations when base already has full path", async () => {
    setEnv("OPENAI_IMAGE_API_KEY", "k");
    setEnv("OPENAI_IMAGE_ENDPOINT", undefined);
    setEnv(
      "OPENAI_IMAGE_BASE_URL",
      "https://example.cognitiveservices.azure.com/openai/deployments/gpt-image-2/images/generations?api-version=2024-02-01",
    );

    const fetchMock = vi.fn(async () =>
      Response.json({
        data: [{ b64_json: Buffer.from("x").toString("base64") }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { openAiGenerateImageToBytes } = await import(
      "../../../../app/server/imageGeneration/openAiImageGenerate.server"
    );
    const result = await openAiGenerateImageToBytes({ prompt: "test prompt ok" });
    expect(result.ok).toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://example.cognitiveservices.azure.com/openai/deployments/gpt-image-2/images/generations?api-version=2024-02-01",
    );
    expect(url).not.toContain("/images/generations/images");

    const sentBody = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(sentBody.response_format).toBeUndefined();
    expect(sentBody.model).toBe("gpt-image-2");
  });
});
