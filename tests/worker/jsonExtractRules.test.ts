import { describe, expect, it } from "vitest";
import {
  buildDefaultJsonExtractRules,
  extractJsonTextSlots,
  jsonHasExtractableText,
  tryParseJsonContainer,
} from "../../worker/src/services/jsonExtractRules.js";
import { canTranslateMetafieldJson, JSON_JUDGE } from "../../worker/src/services/translationFilter/metafieldJsonJudge.js";
import { countFieldUnits } from "../../worker/src/services/llmTranslate.js";

describe("jsonExtractRules — Spring buildDefaultRules", () => {
  it("extracts type=text value nodes (Shopify rich text JSON)", () => {
    const root = tryParseJsonContainer('{"type":"text","value":"Hello World","children":[]}')!;
    const slots = extractJsonTextSlots(root, buildDefaultJsonExtractRules());
    expect(slots).toHaveLength(1);
    expect(slots[0]!.text).toBe("Hello World");
    expect(slots[0]!.isHtml).toBe(false);
  });

  it("marks JSON text slot as HTML when value contains markup (not only field name)", () => {
    const html =
      '<table><tbody><tr><td style="font-weight:bold">XS</td><td>77</td></tr></tbody></table>';
    const root = tryParseJsonContainer(
      JSON.stringify({ type: "text", value: html, children: [] }),
    )!;
    const slots = extractJsonTextSlots(root);
    expect(slots).toHaveLength(1);
    expect(slots[0]!.isHtml).toBe(true);
    expect(countFieldUnits("value", JSON.stringify({ type: "text", value: html, children: [] }))).toBe(
      2,
    );
  });

  it("does not extract reviews paths (not in default rules)", () => {
    const value = JSON.stringify({
      reviews: [{ title: "Comfy and fun to wear", body: "Previously bought the red and white." }],
      rating: 1,
    });
    const root = tryParseJsonContainer(value)!;
    expect(extractJsonTextSlots(root)).toHaveLength(0);
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

describe("metafieldJsonJudge — content-based extract rules", () => {
  it("excludes bundle JSON", () => {
    const bundle =
      '[{"id":"53476","n":"Bundle-un","ot":5,"qt":2,"dt":0,"dv":0.0,"pr":1}]';
    expect(canTranslateMetafieldJson(bundle, "JSON")).toBe(false);
  });

  it("excludes JSON with reviews only", () => {
    const review = JSON.stringify({
      reviews: [{ title: "Great product", body: "Nice" }],
    });
    expect(canTranslateMetafieldJson(review, "JSON")).toBe(false);
  });

  it("includes rich text when value has type:text nodes (ignores Shopify type)", () => {
    const rich = '{"type":"text","value":"Ships in 3 days"}';
    expect(canTranslateMetafieldJson(rich, "RICH_TEXT_FIELD")).toBe(true);
    expect(canTranslateMetafieldJson(rich, "JSON")).toBe(true);
    expect(canTranslateMetafieldJson(rich, "SINGLE_LINE_TEXT_FIELD")).toBe(true);
  });

  it("includes rich text root JSON with spaced type field (not substring match)", () => {
    const value = JSON.stringify(
      {
        type: "root",
        children: [{ type: "paragraph", children: [{ type: "text", value: "Hello" }] }],
      },
      null,
      2,
    );
    expect(canTranslateMetafieldJson(value, "JSON")).toBe(true);
    expect(value.includes(JSON_JUDGE)).toBe(false);
  });

  it("extracts nested rich-text root/paragraph/link but skips url field", () => {
    const value = JSON.stringify({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            { type: "text", value: "我想要测试下元字段" },
            {
              type: "link",
              url: "https://ciwi.ai",
              children: [{ type: "text", value: "May the force be with you" }],
            },
            { type: "text", value: "潜身在此山" },
          ],
        },
      ],
    });
    const slots = extractJsonTextSlots(tryParseJsonContainer(value)!);
    const texts = slots.map((s) => s.text);
    expect(texts).toContain("我想要测试下元字段");
    expect(texts).toContain("May the force be with you");
    expect(texts).toContain("潜身在此山");
    expect(texts).not.toContain("https://ciwi.ai");
  });

  it("does not extract url-only string values", () => {
    const root = tryParseJsonContainer('{"type":"link","url":"https://ciwi.ai","children":[]}')!;
    expect(extractJsonTextSlots(root)).toHaveLength(0);
  });

  it("excludes plain JSON without type:text marker", () => {
    const plain = JSON.stringify({ title: "Hello", body_html: "<p>x</p>" });
    expect(canTranslateMetafieldJson(plain, "JSON")).toBe(false);
  });
});
