import { afterEach, describe, expect, it } from "vitest";
import { isOpenAiImageConfigured } from "../../../../app/server/imageGeneration/openAiImageGenerate.server";

describe("openAiImageGenerate config", () => {
  const prev: Record<string, string | undefined> = {};

  afterEach(() => {
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
});
