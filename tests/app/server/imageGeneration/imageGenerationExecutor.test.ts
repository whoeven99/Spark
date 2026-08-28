import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateImageToBytes: vi.fn(),
  uploadGeneratedImageAndGetUrl: vi.fn(),
  isImageGenerationConfigured: vi.fn(() => true),
  resolveImageGenerationProvider: vi.fn(() => "openai" as const),
}));

vi.mock("../../../../app/server/imageGeneration/generateImageToBytes.server", () => ({
  generateImageToBytes: mocks.generateImageToBytes,
}));

vi.mock("../../../../app/server/imageGeneration/imageGenerationBlob.server", () => ({
  uploadGeneratedImageAndGetUrl: mocks.uploadGeneratedImageAndGetUrl,
}));

vi.mock("../../../../app/server/imageGeneration/imageGenerationConfig.server", () => ({
  isImageGenerationConfigured: mocks.isImageGenerationConfigured,
  resolveImageGenerationProvider: mocks.resolveImageGenerationProvider,
}));

import {
  executeImageGeneration,
  isRetryableImageGenerationFailure,
  normalizeImageGenerationPrompt,
  validateImageGenerationPrompt,
} from "../../../../app/server/imageGeneration/imageGenerationExecutor.server";

describe("imageGenerationExecutor", () => {
  it("normalizes whitespace in prompt", () => {
    expect(normalizeImageGenerationPrompt("  hello   world  ")).toBe("hello world");
  });

  it("rejects too short prompt", () => {
    expect(validateImageGenerationPrompt("ab")).toMatch(/至少/);
  });

  it("accepts valid prompt", () => {
    expect(validateImageGenerationPrompt("白色背景上的运动鞋")).toBeNull();
  });
});

describe("isRetryableImageGenerationFailure", () => {
  it("retries provider/transient failures", () => {
    expect(isRetryableImageGenerationFailure("openai_api_error")).toBe(true);
    expect(isRetryableImageGenerationFailure("openai_request_failed")).toBe(true);
    expect(isRetryableImageGenerationFailure("volc_api_error")).toBe(true);
    expect(isRetryableImageGenerationFailure("blob_upload_failed")).toBe(true);
  });

  it("does not retry config or validation failures", () => {
    expect(isRetryableImageGenerationFailure("credentials_missing")).toBe(false);
    expect(isRetryableImageGenerationFailure("openai_credentials_missing")).toBe(false);
    expect(isRetryableImageGenerationFailure("prompt_invalid")).toBe(false);
    expect(isRetryableImageGenerationFailure("disabled")).toBe(false);
  });
});

describe("executeImageGeneration retry", () => {
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isImageGenerationConfigured.mockReturnValue(true);
    mocks.resolveImageGenerationProvider.mockReturnValue("openai");
    mocks.uploadGeneratedImageAndGetUrl.mockResolvedValue({
      imageUrl: "https://blob.example/generated.png",
      blobPath: "generated-images/demo.png",
    });
  });

  it("retries once after a transient generate failure and succeeds", async () => {
    mocks.generateImageToBytes
      .mockResolvedValueOnce({
        ok: false,
        reasonCode: "openai_api_error",
        detail: "The server had an error while processing your request.",
      })
      .mockResolvedValueOnce({ ok: true, bytes: pngBytes });

    const result = await executeImageGeneration({
      requestId: "req-retry-ok",
      shop: "demo.myshopify.com",
      prompt: "黑色马克杯",
    });

    expect(result.ok).toBe(true);
    expect(mocks.generateImageToBytes).toHaveBeenCalledTimes(2);
    expect(mocks.uploadGeneratedImageAndGetUrl).toHaveBeenCalledTimes(1);
  });

  it("does not retry credential failures", async () => {
    mocks.generateImageToBytes.mockResolvedValue({
      ok: false,
      reasonCode: "openai_credentials_missing",
    });

    const result = await executeImageGeneration({
      requestId: "req-no-retry",
      shop: "demo.myshopify.com",
      prompt: "黑色马克杯",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("credentials_missing");
    }
    expect(mocks.generateImageToBytes).toHaveBeenCalledTimes(1);
    expect(mocks.uploadGeneratedImageAndGetUrl).not.toHaveBeenCalled();
  });

  it("fails after a second generate attempt", async () => {
    mocks.generateImageToBytes.mockResolvedValue({
      ok: false,
      reasonCode: "openai_api_error",
      detail: "The server had an error while processing your request.",
    });

    const result = await executeImageGeneration({
      requestId: "req-retry-fail",
      shop: "demo.myshopify.com",
      prompt: "黑色马克杯",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("openai_api_error");
    }
    expect(mocks.generateImageToBytes).toHaveBeenCalledTimes(2);
  });

  it("retries blob upload once after the first upload throws", async () => {
    mocks.generateImageToBytes.mockResolvedValue({ ok: true, bytes: pngBytes });
    mocks.uploadGeneratedImageAndGetUrl
      .mockRejectedValueOnce(new Error("blob timeout"))
      .mockResolvedValueOnce({
        imageUrl: "https://blob.example/generated.png",
        blobPath: "generated-images/demo.png",
      });

    const result = await executeImageGeneration({
      requestId: "req-blob-retry",
      shop: "demo.myshopify.com",
      prompt: "黑色马克杯",
    });

    expect(result.ok).toBe(true);
    expect(mocks.generateImageToBytes).toHaveBeenCalledTimes(1);
    expect(mocks.uploadGeneratedImageAndGetUrl).toHaveBeenCalledTimes(2);
  });
});
