import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  classifyField,
  countFieldUnits,
  resolveDeepSeekPoolConcurrency,
} from "../../worker/src/services/llmTranslate.js";

describe("classifyField — JSON / LIST detection", () => {
  it("classifies JSON object/array values as json (before html)", () => {
    expect(classifyField("value", '{"a":"Add to cart"}')).toBe("json");
    expect(classifyField("value", '[{"label":"Save"}]')).toBe("json");
    expect(classifyField("value", '{"body":"<p>Hello world</p>"}')).toBe("json");
  });

  it("classifies LIST_SINGLE_LINE_TEXT_FIELD string arrays as list", () => {
    expect(
      classifyField("value", '["Line one","Line two"]', "LIST_SINGLE_LINE_TEXT_FIELD"),
    ).toBe("list");
  });

  it("still classifies plain and html normally", () => {
    expect(classifyField("title", "Just some text")).toBe("plain");
    expect(classifyField("body_html", "<p>Hello world</p>")).toBe("html");
    expect(classifyField("handle", '{"a":"b"}')).toBe("skip");
  });

  it("does not treat bracketed prose as JSON", () => {
    expect(classifyField("title", "[Sale] Big discount today")).toBe("plain");
  });
});

describe("countFieldUnits — rule-based JSON", () => {
  it("counts only rule-matched string fields", () => {
    const value = JSON.stringify({
      cartTitle: "Your cart",
      checkout: "Proceed to checkout",
      alignment: "center",
    });
    expect(countFieldUnits("value", value)).toBe(0);
  });

  it("counts type=text value nodes", () => {
    const value = JSON.stringify({ type: "text", value: "Your cart", children: [] });
    expect(countFieldUnits("value", value)).toBe(1);
  });

  it("counts reviews[*] fields via path rules", () => {
    const value = JSON.stringify({
      reviews: [{ title: "Welcome", body: "Hello world" }],
      rating: 5,
    });
    expect(countFieldUnits("value", value)).toBe(2);
  });

  it("returns 0 for purely structural JSON", () => {
    const value = JSON.stringify({ active: false, position: "bottom_right", pad: 15 });
    expect(countFieldUnits("value", value)).toBe(0);
  });

  it("matches HTML node count for body_html (unchanged behaviour)", () => {
    expect(countFieldUnits("body_html", "<p>One</p><p>Two</p>")).toBe(2);
  });
});

describe("resolveDeepSeekPoolConcurrency — initial concurrency", () => {
  const prev = process.env.DEEPSEEK_INITIAL_CONCURRENCY;
  beforeEach(() => {
    delete process.env.DEEPSEEK_INITIAL_CONCURRENCY;
    delete process.env.DEEPSEEK_CONCURRENCY_LIMIT;
    delete process.env.DEEPSEEK_CONCURRENCY_UTIL;
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.DEEPSEEK_INITIAL_CONCURRENCY;
    else process.env.DEEPSEEK_INITIAL_CONCURRENCY = prev;
  });

  it("starts pro within the configured ceiling", () => {
    const { ceiling, initial } = resolveDeepSeekPoolConcurrency("deepseek-v4-pro");
    expect(ceiling).toBeGreaterThan(0);
    expect(initial).toBeGreaterThan(0);
    expect(initial).toBeLessThanOrEqual(ceiling);
  });

  it("never exceeds the ceiling and respects the explicit override", () => {
    process.env.DEEPSEEK_INITIAL_CONCURRENCY = "5";
    const { initial } = resolveDeepSeekPoolConcurrency("deepseek-v4-pro");
    expect(initial).toBe(5);
  });
});
