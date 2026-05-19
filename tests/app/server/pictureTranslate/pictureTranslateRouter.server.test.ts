import { describe, expect, it } from "vitest";
import {
  resolvePictureTranslateProvider,
  resolvePictureTranslateProviderForced,
} from "../../../../app/server/pictureTranslate/pictureTranslateRouter.server";

describe("resolvePictureTranslateProvider", () => {
  it("prefers volc when both engines support en -> fr with png", () => {
    const route = resolvePictureTranslateProvider({
      sourceLanguage: "en",
      targetLanguage: "fr",
      imageExtensionLower: "png",
    });
    expect(route).toEqual({
      ok: true,
      provider: "volc",
      sourceVolc: "en",
      targetVolc: "fr",
      sourceAidge: "en",
      targetAidge: "fr",
    });
  });

  it("uses aidge for pairs only aidge supports (en -> ar)", () => {
    const route = resolvePictureTranslateProvider({
      sourceLanguage: "en",
      targetLanguage: "ar",
      imageExtensionLower: "png",
    });
    expect(route.ok).toBe(true);
    if (route.ok) {
      expect(route.provider).toBe("aidge");
    }
  });

  it("rejects unsupported language pairs", () => {
    const route = resolvePictureTranslateProvider({
      sourceLanguage: "bs",
      targetLanguage: "ar",
      imageExtensionLower: "png",
    });
    expect(route).toEqual({ ok: false, reason: "language_pair_not_supported" });
  });

  it("uses volc for auto source when target is in volc output set", () => {
    const route = resolvePictureTranslateProvider({
      sourceLanguage: "auto",
      targetLanguage: "en",
      imageExtensionLower: "jpg",
    });
    expect(route.ok).toBe(true);
    if (route.ok) {
      expect(route.provider).toBe("volc");
    }
  });

  it("requires explicit source for auto when volc cannot handle target", () => {
    const route = resolvePictureTranslateProvider({
      sourceLanguage: "auto",
      targetLanguage: "ar",
      imageExtensionLower: "png",
    });
    expect(route).toEqual({ ok: false, reason: "auto_requires_explicit_source" });
  });

  it("does not route volc language pair to volc when only jpeg extension", () => {
    const route = resolvePictureTranslateProvider({
      sourceLanguage: "en",
      targetLanguage: "fr",
      imageExtensionLower: "jpeg",
    });
    expect(route.ok).toBe(true);
    if (route.ok) {
      expect(route.provider).toBe("aidge");
    }
  });
});

describe("resolvePictureTranslateProviderForced", () => {
  it("forces volc for modelType 2 without aidge fallback", () => {
    const route = resolvePictureTranslateProviderForced({
      modelType: 2,
      sourceLanguage: "en",
      targetLanguage: "ar",
      imageExtensionLower: "png",
    });
    expect(route).toEqual({ ok: false, reason: "language_pair_not_supported" });
  });

  it("forces aidge for modelType 1", () => {
    const route = resolvePictureTranslateProviderForced({
      modelType: 1,
      sourceLanguage: "en",
      targetLanguage: "ar",
      imageExtensionLower: "png",
    });
    expect(route.ok).toBe(true);
    if (route.ok) {
      expect(route.provider).toBe("aidge");
    }
  });
});
