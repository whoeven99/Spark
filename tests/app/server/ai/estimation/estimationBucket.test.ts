import { describe, it, expect } from "vitest";
import { deriveBucket } from "../../../../../app/server/aiTask/estimationBucket";

describe("deriveBucket", () => {
  it("product_improve buckets by combined text+title length (log2)", () => {
    const short = deriveBucket("product_improve", {
      originalText: "x".repeat(50),
      originalTitle: "",
    });
    const long = deriveBucket("product_improve", {
      originalText: "x".repeat(5000),
      originalTitle: "title",
    });
    expect(short).toMatch(/^len-\d$/);
    expect(long).toMatch(/^len-\d$/);
    expect(short).not.toBe(long);
  });

  it("product_improve empty text falls into len-0", () => {
    expect(deriveBucket("product_improve", {})).toBe("len-0");
  });

  it("product_improve caps the top bucket at len-8", () => {
    expect(
      deriveBucket("product_improve", { originalText: "x".repeat(1_000_000) }),
    ).toBe("len-8");
  });

  it("picture_translate buckets by modelType", () => {
    expect(deriveBucket("picture_translate", { modelType: 1 })).toBe("m1");
    expect(deriveBucket("picture_translate", { modelType: 2 })).toBe("m2");
    expect(deriveBucket("picture_translate", {})).toBe("default");
  });

  it("image_generation buckets by provider", () => {
    expect(deriveBucket("image_generation", { imageProvider: "volc" })).toBe(
      "prov-volc",
    );
    expect(deriveBucket("image_generation", { imageProvider: "openai" })).toBe(
      "prov-openai",
    );
    expect(deriveBucket("image_generation", {})).toBe("default");
  });

  it("translation buckets by target language (target or targetCode)", () => {
    expect(deriveBucket("translation", { target: "ja" })).toBe("lang-ja");
    expect(deriveBucket("translation", { targetCode: "fr" })).toBe("lang-fr");
    expect(deriveBucket("translation", {})).toBe("default");
  });

  it("returns default for null/undefined config", () => {
    expect(deriveBucket("translation", null)).toBe("default");
    expect(deriveBucket("picture_translate", undefined)).toBe("default");
  });
});
