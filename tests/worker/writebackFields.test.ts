import { describe, expect, it } from "vitest";
import { filterWritebackFields } from "../../worker/src/services/writebackFields.js";

describe("filterWritebackFields", () => {
  it("keeps same-value title for glossary terms", () => {
    const out = filterWritebackFields([
      { key: "title", originalValue: "test", translatedValue: "test" },
    ]);
    expect(out).toHaveLength(1);
  });

  it("skips handle when unchanged (Shopify rejects duplicate handle)", () => {
    const out = filterWritebackFields([
      { key: "handle", originalValue: "my-slug", translatedValue: "my-slug" },
      { key: "title", originalValue: "Hi", translatedValue: "Cześć" },
    ]);
    expect(out.map((f) => f.key)).toEqual(["title"]);
  });

  it("keeps handle when value changed", () => {
    const out = filterWritebackFields([
      { key: "handle", originalValue: "old", translatedValue: "nowy-slug" },
    ]);
    expect(out).toHaveLength(1);
  });

  it("drops empty translated values", () => {
    expect(filterWritebackFields([{ key: "title", originalValue: "x", translatedValue: "  " }])).toHaveLength(0);
  });
});
