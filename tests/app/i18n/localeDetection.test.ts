import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  mapShopLocaleToUiLocale,
  normalizeLocale,
} from "../../../app/i18n/config";
import { detectRequestLocale } from "../../../app/i18n/detector.server";

describe("mapShopLocaleToUiLocale", () => {
  it("maps Chinese shop locales to zh-CN", () => {
    expect(mapShopLocaleToUiLocale("zh-CN")).toBe("zh-CN");
    expect(mapShopLocaleToUiLocale("zh")).toBe("zh-CN");
    expect(mapShopLocaleToUiLocale("zh-TW")).toBe("zh-CN");
    expect(mapShopLocaleToUiLocale("zh_CN")).toBe("zh-CN");
  });

  it("maps non-Chinese shop locales to en", () => {
    expect(mapShopLocaleToUiLocale("en")).toBe("en");
    expect(mapShopLocaleToUiLocale("ja")).toBe("en");
    expect(mapShopLocaleToUiLocale("de")).toBe("en");
    expect(mapShopLocaleToUiLocale(null)).toBe(DEFAULT_LOCALE);
  });
});

describe("detectRequestLocale", () => {
  it("prefers manual cookie over shop primary locale", () => {
    const request = new Request("https://example.com", {
      headers: { cookie: "spark_locale=en" },
    });
    expect(
      detectRequestLocale(request, { shopPrimaryLocale: "zh-CN" }),
    ).toBe("en");
  });

  it("uses shop primary locale when cookie is absent", () => {
    const request = new Request("https://example.com");
    expect(
      detectRequestLocale(request, { shopPrimaryLocale: "zh-TW" }),
    ).toBe("zh-CN");
    expect(
      detectRequestLocale(request, { shopPrimaryLocale: "ja" }),
    ).toBe("en");
  });

  it("defaults to English without cookie or shop locale", () => {
    const request = new Request("https://example.com", {
      headers: { "accept-language": "zh-CN,zh;q=0.9" },
    });
    expect(detectRequestLocale(request)).toBe("en");
  });
});

describe("normalizeLocale", () => {
  it("accepts zh-* as zh-CN", () => {
    expect(normalizeLocale("zh-TW")).toBe("zh-CN");
    expect(normalizeLocale("zh-Hans")).toBe("zh-CN");
  });
});
