import { describe, expect, it } from "vitest";
import {
  dedupeImageMappingsNewestFirst,
  extractImageFileName,
  languagesMatch,
} from "../../../app/lib/imageSwitcher";

describe("extractImageFileName", () => {
  it("strips query and hash from Shopify CDN urls", () => {
    expect(
      extractImageFileName(
        "https://cdn.shopify.com/s/files/1/1/2/files/shoe.jpg?v=123#x",
      ),
    ).toBe("shoe.jpg");
  });

  it("keeps storefront cdn/shop path filename", () => {
    expect(
      extractImageFileName(
        "https://shop.myshopify.com/cdn/shop/files/shoe.jpg?width=800",
      ),
    ).toBe("shoe.jpg");
  });
});

describe("dedupeImageMappingsNewestFirst", () => {
  it("keeps the first row when filenames collide (caller sorts newest first)", () => {
    const newest =
      "https://cdn.shopify.com/s/files/1/1/2/files/shoe.jpg?v=200";
    const oldest =
      "https://cdn.shopify.com/s/files/1/1/2/files/shoe.jpg?v=100";
    expect(
      dedupeImageMappingsNewestFirst([
        { sourceUrl: newest, targetUrl: "https://blob.example/new.jpg" },
        { sourceUrl: oldest, targetUrl: "https://blob.example/old.jpg" },
      ]),
    ).toEqual([
      { sourceUrl: newest, targetUrl: "https://blob.example/new.jpg" },
    ]);
  });

  it("does not collapse different filenames", () => {
    expect(
      dedupeImageMappingsNewestFirst([
        { sourceUrl: "https://cdn.example/a.jpg", targetUrl: "https://t/a.jpg" },
        { sourceUrl: "https://cdn.example/b.jpg", targetUrl: "https://t/b.jpg" },
      ]),
    ).toHaveLength(2);
  });
});

describe("languagesMatch", () => {
  it("treats zh and zh-CN as simplified Chinese", () => {
    expect(languagesMatch("zh", "zh-CN")).toBe(true);
    expect(languagesMatch("zh-CN", "zh-Hans")).toBe(true);
  });

  it("does not treat simplified and traditional as the same", () => {
    expect(languagesMatch("zh-CN", "zh-TW")).toBe(false);
    expect(languagesMatch("zh", "zh-TW")).toBe(false);
    expect(languagesMatch("zh-CN", "zh-HK")).toBe(false);
  });

  it("treats traditional variants as the same", () => {
    expect(languagesMatch("zh-TW", "zh-Hant")).toBe(true);
    expect(languagesMatch("zh-TW", "zh-HK")).toBe(true);
  });

  it("does not collapse Portuguese Brazil and Portugal", () => {
    expect(languagesMatch("pt-BR", "pt-PT")).toBe(false);
    expect(languagesMatch("pt", "pt-BR")).toBe(true);
    expect(languagesMatch("pt", "pt-PT")).toBe(true);
  });

  it("still matches language base tags like ja / en", () => {
    expect(languagesMatch("ja", "ja-JP")).toBe(true);
    expect(languagesMatch("en", "en-US")).toBe(true);
    expect(languagesMatch("ja", "en")).toBe(false);
  });
});
