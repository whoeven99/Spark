import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  classifyField,
  countFieldUnits,
  resolveDeepSeekPoolConcurrency,
} from "../../worker/src/services/llmTranslate.js";

// These cover the pure, engine-free surface of the translate-speed work:
//  - JSON metafield values are split into per-leaf units (so a 30KB config blob
//    parallelises instead of going out as one straggler request);
//  - structural/endum tokens are NOT counted as units (no "center"→"zentriert");
//  - the DeepSeek pool starts at a high initial concurrency.

describe("classifyField — JSON detection", () => {
  it("classifies JSON object/array values as json (before html)", () => {
    expect(classifyField("value", '{"a":"Add to cart"}')).toBe("json");
    expect(classifyField("value", '[{"label":"Save"}]')).toBe("json");
    // JSON wins even when a leaf contains HTML markup.
    expect(classifyField("value", '{"body":"<p>Hello world</p>"}')).toBe("json");
  });

  it("still classifies plain and html normally", () => {
    expect(classifyField("title", "Just some text")).toBe("plain");
    expect(classifyField("body_html", "<p>Hello world</p>")).toBe("html");
    expect(classifyField("handle", '{"a":"b"}')).toBe("skip"); // skip key wins
  });

  it("does not treat bracketed prose as JSON", () => {
    expect(classifyField("title", "[Sale] Big discount today")).toBe("plain");
  });
});

describe("countFieldUnits — JSON leaf splitting", () => {
  it("counts only human-readable string leaves", () => {
    // 3 translatable leaves; structural keys/values are not counted.
    const value = JSON.stringify({
      cartTitle: "Your cart",
      checkout: "Proceed to checkout",
      emptyCart: "Your cart is empty",
      alignment: "center", // enum → skipped
      color: "#000000", // hex → skipped
      icon: "https://cdn.example.com/x.png", // url → skipped
      size: "42", // numeric string → skipped
      style: "dropdown_vertical", // lowercase token → skipped
    });
    expect(countFieldUnits("value", value)).toBe(3);
  });

  it("counts leaves inside nested arrays/objects", () => {
    const value = JSON.stringify({
      sections: [
        { heading: "Welcome", cta: "Shop now" },
        { heading: "About us" },
      ],
      meta: { footer: "All rights reserved" },
    });
    expect(countFieldUnits("value", value)).toBe(4);
  });

  it("keeps placeholder-bearing copy as translatable units", () => {
    const value = JSON.stringify({ cartTitle: "Cart • {{cart_quantity}}" });
    expect(countFieldUnits("value", value)).toBe(1);
  });

  it("returns 0 for purely structural JSON (no copy to translate)", () => {
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

  it("starts pro near 40% of the ceiling, not a timid few dozen", () => {
    const { ceiling, initial } = resolveDeepSeekPoolConcurrency("deepseek-v4-pro");
    // ceiling = floor(500 * 0.9) = 450; initial = max(128, floor(450*0.4)) = 180.
    expect(ceiling).toBe(450);
    expect(initial).toBe(180);
  });

  it("never exceeds the ceiling and respects the explicit override", () => {
    process.env.DEEPSEEK_INITIAL_CONCURRENCY = "5";
    const { initial } = resolveDeepSeekPoolConcurrency("deepseek-v4-pro");
    expect(initial).toBe(5);
  });
});
