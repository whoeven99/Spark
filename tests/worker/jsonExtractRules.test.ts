import { describe, expect, it } from "vitest";
import {
  buildDefaultJsonExtractRules,
  extractJsonTextSlots,
  jsonHasExtractableText,
  tryParseJsonContainer,
} from "../../worker/src/services/jsonExtractRules.js";
import { canTranslateMetafieldJson } from "../../worker/src/services/translationFilter/metafieldJsonJudge.js";
import { countFieldUnits } from "../../worker/src/services/llmTranslate.js";

describe("jsonExtractRules — prod Redis rules", () => {
  it("extracts type=text value nodes (Shopify rich text JSON)", () => {
    const root = tryParseJsonContainer('{"type":"text","value":"Hello World","children":[]}')!;
    const slots = extractJsonTextSlots(root, buildDefaultJsonExtractRules());
    expect(slots).toHaveLength(1);
    expect(slots[0]!.text).toBe("Hello World");
  });

  it("extracts reviews[*].title and reviews[*].body", () => {
    const value = JSON.stringify({
      reviews: [{ title: "Comfy and fun to wear", body: "Previously bought the red and white." }],
      rating: 1,
    });
    const root = tryParseJsonContainer(value)!;
    const texts = extractJsonTextSlots(root).map((s) => s.fieldName).sort();
    expect(texts).toEqual(["body", "title"]);
  });

  it("does not extract bundle config keys like n/id", () => {
    const value =
      '[{"id":"53476","n":"Bundle-un","ot":5,"qt":2,"dt":0,"dv":0.0,"pr":1,"ps":null}]';
    expect(jsonHasExtractableText(value)).toBe(false);
    expect(countFieldUnits("value", value, "JSON")).toBe(0);
  });

  it("extracts virtual_options paths", () => {
    const value = JSON.stringify({
      virtual_options: [{ title: "Enter title", values: [{ key: "Our key" }] }],
    });
    const texts = extractJsonTextSlots(tryParseJsonContainer(value)!).map((s) => s.text);
    expect(texts).toContain("Enter title");
    expect(texts).toContain("Our key");
  });
});

describe("metafieldJsonJudge — prod needTranslateJudge", () => {
  it("excludes bundle JSON (no mustContain marker)", () => {
    const bundle =
      '[{"id":"53476","n":"Bundle-un","ot":5,"qt":2,"dt":0,"dv":0.0,"pr":1}]';
    expect(canTranslateMetafieldJson(bundle, "JSON")).toBe(false);
  });

  it("includes JSON with reviews array", () => {
    const review = JSON.stringify({
      reviews: [{ title: "Great product", body: "Nice" }],
    });
    expect(canTranslateMetafieldJson(review, "JSON")).toBe(true);
  });

  it("includes RICH_TEXT with type:text in allowed types", () => {
    const rich = '{"type":"text","value":"Ships in 3 days"}';
    expect(canTranslateMetafieldJson(rich, "RICH_TEXT_FIELD")).toBe(true);
  });

  it("excludes plain JSON without mustContain markers", () => {
    const plain = JSON.stringify({ title: "Hello", body_html: "<p>x</p>" });
    expect(canTranslateMetafieldJson(plain, "JSON")).toBe(false);
  });
});
