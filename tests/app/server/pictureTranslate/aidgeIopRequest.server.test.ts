import { describe, expect, it } from "vitest";
import {
  resolveAidgeIopRequestUrl,
  signIopRequest,
} from "../../../../app/server/pictureTranslate/aidgeIopRequest.server";

describe("resolveAidgeIopRequestUrl", () => {
  it("prefixes /rest for IOP gateway", () => {
    expect(resolveAidgeIopRequestUrl("/ai/image/translation")).toBe(
      "/rest/ai/image/translation",
    );
  });

  it("does not double-prefix when api path already includes gateway", () => {
    expect(resolveAidgeIopRequestUrl("/rest/ai/image/translation")).toBe(
      "/rest/ai/image/translation",
    );
  });
});

describe("signIopRequest", () => {
  it("produces deterministic uppercase hex sign", () => {
    const signed = signIopRequest({
      apiName: "/ai/image/translation",
      businessParams: {
        imageUrl: "https://example.com/a.png",
        sourceLanguage: "en",
        targetLanguage: "zh",
        translatingTextInTheProduct: "false",
      },
      accessKeyId: "test-key",
      accessKeySecret: "test-secret",
      timestampMs: 1_700_000_000_000,
    });

    expect(signed.app_key).toBe("test-key");
    expect(signed.timestamp).toBe("1700000000000");
    expect(signed.sign_method).toBe("sha256");
    expect(signed.sign).toMatch(/^[A-F0-9]{64}$/);
    expect(signed.imageUrl).toBe("https://example.com/a.png");
  });
});
