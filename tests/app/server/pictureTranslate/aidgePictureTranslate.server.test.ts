import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeAidgeIopRequest: vi.fn(),
}));

vi.mock("~/server/pictureTranslate/aidgeIopRequest.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/server/pictureTranslate/aidgeIopRequest.server")>();
  return {
    ...actual,
    readAidgeIopCredentials: () => ({
      accessKeyId: "key",
      accessKeySecret: "secret",
    }),
    executeAidgeIopRequest: mocks.executeAidgeIopRequest,
  };
});

import {
  aidgeTranslateImageByUrl,
  extractTranslatedImageUrl,
  isAidgeBusinessSuccess,
  isAidgeIopGatewaySuccessCode,
} from "../../../../app/server/pictureTranslate/aidgePictureTranslate.server";

describe("isAidgeIopGatewaySuccessCode", () => {
  it("treats 0 and 200 as IOP success", () => {
    expect(isAidgeIopGatewaySuccessCode("0")).toBe(true);
    expect(isAidgeIopGatewaySuccessCode(0)).toBe(true);
    expect(isAidgeIopGatewaySuccessCode("200")).toBe(true);
    expect(isAidgeIopGatewaySuccessCode("MissingParameter")).toBe(false);
  });
});

describe("isAidgeBusinessSuccess", () => {
  it("accepts official IOP envelope with code 0", () => {
    expect(
      isAidgeBusinessSuccess({
        success: true,
        resCode: 200,
        code: "0",
        data: { resultUrl: "https://cdn.example.com/out.jpg" },
      }),
    ).toBe(true);
  });

  it("rejects IOP ISV error envelope", () => {
    expect(
      isAidgeBusinessSuccess({
        type: "ISV",
        code: "MissingParameter",
        message: "app_key missing",
      }),
    ).toBe(false);
  });
});

describe("extractTranslatedImageUrl", () => {
  it("reads resultUrl from data array", () => {
    expect(
      extractTranslatedImageUrl({
        success: true,
        resCode: 200,
        code: "0",
        data: [{ resultUrl: "https://cdn.example.com/out.jpg" }],
      }),
    ).toBe("https://cdn.example.com/out.jpg");
  });
});

describe("aidgeTranslateImageByUrl", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns translated image url on success response", async () => {
    mocks.executeAidgeIopRequest.mockResolvedValue({
      ok: true,
      elapsedMs: 12,
      body: {
        success: true,
        resCode: 200,
        code: "0",
        data: {
          translatedImageUrl: "https://cdn.example.com/out.jpg",
        },
      },
    });

    const result = await aidgeTranslateImageByUrl({
      imageUrl: "https://example.com/in.jpg",
      sourceLanguage: "en",
      targetLanguage: "zh",
    });

    expect(result).toEqual({
      ok: true,
      translatedImageUrl: "https://cdn.example.com/out.jpg",
      requestId: undefined,
    });
  });

  it("returns translated image url when IOP code is 0 and data is array", async () => {
    mocks.executeAidgeIopRequest.mockResolvedValue({
      ok: true,
      elapsedMs: 10,
      body: {
        success: true,
        resCode: 200,
        code: "0",
        data: [{ resultUrl: "https://cdn.example.com/ar.jpg" }],
        resMessage: "success",
      },
    });

    const result = await aidgeTranslateImageByUrl({
      imageUrl: "https://example.com/in.jpg",
      sourceLanguage: "en",
      targetLanguage: "ar",
    });

    expect(result).toEqual({
      ok: true,
      translatedImageUrl: "https://cdn.example.com/ar.jpg",
      requestId: undefined,
    });
  });

  it("maps business failure to aidge_api_error", async () => {
    mocks.executeAidgeIopRequest.mockResolvedValue({
      ok: true,
      elapsedMs: 8,
      body: { success: false, resCode: 400, errorMsg: "bad request" },
    });

    const result = await aidgeTranslateImageByUrl({
      imageUrl: "https://example.com/in.jpg",
      sourceLanguage: "en",
      targetLanguage: "zh",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasonCode).toBe("aidge_api_error");
    }
  });
});
