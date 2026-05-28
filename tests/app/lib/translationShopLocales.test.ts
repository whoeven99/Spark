import { describe, expect, it } from "vitest";
import {
  resolveDefaultTargetLocale,
  resolveInitialTargetLocales,
  resolveTranslationLocales,
} from "../../../app/lib/translationShopLocales";
import type { ShopLocalesPayload } from "../../../app/lib/productImproveLocales";

function payload(
  overrides: Partial<ShopLocalesPayload> = {},
): ShopLocalesPayload {
  return {
    defaultTargetLanguage: "en",
    localeOptions: [
      { value: "en", label: "English (en)", published: true },
      { value: "fr", label: "French (fr)", published: true },
      { value: "de", label: "German (de)", published: false },
    ],
    isFallback: false,
    ...overrides,
  };
}

describe("resolveTranslationLocales", () => {
  it("uses defaultTargetLanguage as source and excludes it from targets", () => {
    const resolved = resolveTranslationLocales(payload());
    expect(resolved.sourceLocale).toBe("en");
    expect(resolved.sourceLabel).toBe("English (en)");
    expect(resolved.targetOptions.map((o) => o.value)).toEqual(["fr", "de"]);
  });

  it("includes unpublished locales for targets", () => {
    const resolved = resolveTranslationLocales(
      payload({
        defaultTargetLanguage: "zh-CN",
        localeOptions: [
          { value: "zh-CN", label: "简体中文 (zh-CN)", published: true },
          { value: "en", label: "English (en)", published: true },
          { value: "de", label: "German (de)", published: false },
        ],
      }),
    );
    expect(resolved.sourceLocale).toBe("zh-CN");
    expect(resolved.targetOptions.map((o) => o.value)).toEqual(["en", "de"]);
  });

  it("returns all non-source when only unpublished remain besides source", () => {
    const resolved = resolveTranslationLocales(
      payload({
        defaultTargetLanguage: "en",
        localeOptions: [
          { value: "en", label: "English (en)", published: true },
          { value: "de", label: "German (de)", published: false },
        ],
      }),
    );
    expect(resolved.targetOptions.map((o) => o.value)).toEqual(["de"]);
  });

  it("returns empty targetOptions when only primary exists", () => {
    const resolved = resolveTranslationLocales(
      payload({
        localeOptions: [
          { value: "en", label: "English (en)", published: true },
        ],
      }),
    );
    expect(resolved.targetOptions).toEqual([]);
  });
});

describe("resolveDefaultTargetLocale", () => {
  const options = [
    { value: "fr", label: "French (fr)" },
    { value: "ja", label: "日本語 (ja)" },
  ];

  it("keeps initial when in list", () => {
    expect(resolveDefaultTargetLocale(options, "ja")).toBe("ja");
  });

  it("uses first option when initial missing", () => {
    expect(resolveDefaultTargetLocale(options, "en")).toBe("fr");
  });

  it("returns empty when no options", () => {
    expect(resolveDefaultTargetLocale([], "en")).toBe("");
  });
});

describe("resolveInitialTargetLocales", () => {
  const options = [
    { value: "fr", label: "French (fr)" },
    { value: "ja", label: "日本語 (ja)" },
  ];

  it("uses initialTargetLocales when valid", () => {
    expect(resolveInitialTargetLocales(options, undefined, ["ja", "fr", "ja"])).toEqual([
      "ja",
      "fr",
    ]);
  });

  it("falls back to single initialTargetLocale", () => {
    expect(resolveInitialTargetLocales(options, "ja")).toEqual(["ja"]);
  });

  it("defaults to first option", () => {
    expect(resolveInitialTargetLocales(options)).toEqual(["fr"]);
  });
});
