import { describe, expect, it } from "vitest";
import { buildShopLocalesPayloadFromGraphqlRows } from "./shopLocalesFetcher.server";

describe("buildShopLocalesPayloadFromGraphqlRows", () => {
  it("picks primary locale as default and sorts primary first", () => {
    const payload = buildShopLocalesPayloadFromGraphqlRows([
      { locale: "fr", name: "French", primary: false, published: true },
      { locale: "en", name: "English", primary: true, published: true },
    ]);
    expect(payload.isFallback).toBe(false);
    expect(payload.defaultTargetLanguage).toBe("en");
    expect(payload.localeOptions[0]?.value).toBe("en");
  });

  it("dedupes by locale", () => {
    const payload = buildShopLocalesPayloadFromGraphqlRows([
      { locale: "de", name: "German", primary: true, published: true },
      { locale: "de", name: "German duplicate", primary: false, published: true },
    ]);
    expect(payload.localeOptions).toHaveLength(1);
    expect(payload.defaultTargetLanguage).toBe("de");
  });

  it("returns fallback for empty array", () => {
    const payload = buildShopLocalesPayloadFromGraphqlRows([]);
    expect(payload.isFallback).toBe(true);
    expect(payload.defaultTargetLanguage).toBe("en");
    expect(payload.localeOptions.length).toBeGreaterThan(1);
  });
});
