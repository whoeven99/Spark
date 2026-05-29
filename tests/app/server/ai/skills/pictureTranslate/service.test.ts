import { beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_MESSAGES, MAX_IMAGE_BYTES } from "../../../../../../app/server/ai/skills/pictureTranslate/constants";

const mocks = vi.hoisted(() => ({
  executePictureTranslatePipeline: vi.fn(),
  fetchSourceImageBytes: vi.fn(),
  logDetailedError: vi.fn(),
}));

vi.mock("~/server/pictureTranslate/pictureTranslateExecutor.server", () => ({
  executePictureTranslatePipeline: mocks.executePictureTranslatePipeline,
}));

vi.mock("~/server/pictureTranslate/volcenginePictureTranslate.server", () => ({
  fetchSourceImageBytes: mocks.fetchSourceImageBytes,
}));

vi.mock("~/server/productImprove/generateDescriptionLog.server", () => ({
  logDetailedError: mocks.logDetailedError,
}));

import {
  executePictureTranslateTool,
  safeExecutePictureTranslateTool,
} from "../../../../../../app/server/ai/skills/pictureTranslate/service";

function pngBytes(): Buffer {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02,
  ]);
}

describe("executePictureTranslateTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns image url invalid when source image fetch fails", async () => {
    mocks.fetchSourceImageBytes.mockResolvedValue({
      ok: false,
      reasonCode: "image_fetch_failed",
    });

    const result = await executePictureTranslateTool({
      requestId: "req-1",
      shop: "demo-shop",
      input: {
        imageUrl: "https://example.com/demo.jpg",
        targetLanguage: "en",
        sourceLanguage: "auto",
      },
    });

    expect(result).toEqual({
      success: false,
      error: ERROR_MESSAGES.IMAGE_URL_INVALID,
    });
  });

  it("returns base64 invalid when imageBase64 cannot be decoded", async () => {
    const result = await executePictureTranslateTool({
      requestId: "req-2",
      shop: "demo-shop",
      input: {
        imageBase64: "not_base64$$",
        targetLanguage: "en",
        sourceLanguage: "auto",
      },
    });

    expect(result).toEqual({
      success: false,
      error: ERROR_MESSAGES.IMAGE_BASE64_INVALID,
    });
  });

  it("returns image too large when bytes exceed 10MB", async () => {
    mocks.fetchSourceImageBytes.mockResolvedValue({
      ok: true,
      bytes: Buffer.alloc(MAX_IMAGE_BYTES + 1, 1),
    });

    const result = await executePictureTranslateTool({
      requestId: "req-3",
      shop: "demo-shop",
      input: {
        imageUrl: "https://example.com/demo.jpg",
        targetLanguage: "en",
        sourceLanguage: "auto",
      },
    });

    expect(result).toEqual({
      success: false,
      error: ERROR_MESSAGES.IMAGE_TOO_LARGE,
    });
  });

  it("returns language pair not supported from pipeline", async () => {
    mocks.fetchSourceImageBytes.mockResolvedValue({
      ok: true,
      bytes: pngBytes(),
    });
    mocks.executePictureTranslatePipeline.mockResolvedValue({
      ok: false,
      reason: "language_pair_not_supported",
    });

    const result = await executePictureTranslateTool({
      requestId: "req-4",
      shop: "demo-shop",
      input: {
        imageUrl: "https://example.com/demo.jpg",
        targetLanguage: "ar",
        sourceLanguage: "bs",
      },
    });

    expect(result).toEqual({
      success: false,
      error: ERROR_MESSAGES.LANGUAGE_PAIR_NOT_SUPPORTED,
    });
  });

  it("returns translated image and empty textBlocks on success", async () => {
    mocks.fetchSourceImageBytes.mockResolvedValue({
      ok: true,
      bytes: pngBytes(),
    });
    mocks.executePictureTranslatePipeline.mockResolvedValue({
      ok: true,
      imageUrl: "https://blob.example.com/translated.jpg",
      provider: "volc",
    });

    const result = await executePictureTranslateTool({
      requestId: "req-5",
      shop: " demo-shop ",
      input: {
        imageUrl: "https://example.com/demo.png",
        targetLanguage: "en",
        sourceLanguage: "auto",
      },
    });

    expect(result).toEqual({
      success: true,
      translatedImage: "https://blob.example.com/translated.jpg",
      textBlocks: [],
    });
  });
});

describe("safeExecutePictureTranslateTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns stable error shape when unexpected exception occurs", async () => {
    mocks.fetchSourceImageBytes.mockRejectedValue(new Error("network down"));

    const result = await safeExecutePictureTranslateTool({
      requestId: "req-6",
      shop: "demo-shop",
      input: {
        imageUrl: "https://example.com/demo.jpg",
        targetLanguage: "en",
        sourceLanguage: "auto",
      },
    });

    expect(result).toEqual({
      success: false,
      error: ERROR_MESSAGES.TOOL_EXECUTION_FAILED,
    });
    expect(mocks.logDetailedError).toHaveBeenCalled();
  });
});
