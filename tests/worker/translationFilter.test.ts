import { describe, expect, it } from "vitest";
import { shouldIncludeField } from "../../worker/src/services/translationFilter.js";

const baseField = { key: "title", value: "Hello", type: "SINGLE_LINE_TEXT_FIELD" };

describe("shouldIncludeField", () => {
  it("excludes empty value", () => {
    expect(
      shouldIncludeField({ key: "title", value: "  ", type: "SINGLE_LINE_TEXT_FIELD" }, [], {
        isCover: false,
        isHandle: false,
      }),
    ).toBe(false);
  });

  it("isCover=false skips field when non-empty translation exists and outdated=false", () => {
    expect(
      shouldIncludeField(baseField, [{ key: "title", outdated: false, value: "Cześć" }], {
        isCover: false,
        isHandle: false,
      }),
    ).toBe(false);
  });

  it("isCover=false includes field when translation key exists but value is empty", () => {
    expect(
      shouldIncludeField(baseField, [{ key: "title", outdated: false, value: "" }], {
        isCover: false,
        isHandle: false,
      }),
    ).toBe(true);
    expect(
      shouldIncludeField(baseField, [{ key: "title", outdated: false }], {
        isCover: false,
        isHandle: false,
      }),
    ).toBe(true);
  });

  it("isCover=false includes field when translation outdated=true", () => {
    expect(
      shouldIncludeField(baseField, [{ key: "title", outdated: true }], {
        isCover: false,
        isHandle: false,
      }),
    ).toBe(true);
  });

  it("isCover=false excludes field when translation outdated is null (aligns V2 !outdated)", () => {
    expect(
      shouldIncludeField(baseField, [{ key: "title", outdated: null, value: "X" }], {
        isCover: false,
        isHandle: false,
      }),
    ).toBe(false);
  });

  it("isCover=true includes field even when translation is current", () => {
    expect(
      shouldIncludeField(baseField, [{ key: "title", outdated: false }], {
        isCover: true,
        isHandle: false,
      }),
    ).toBe(true);
  });

  it("excludes URI handle when isHandle=false", () => {
    expect(
      shouldIncludeField(
        { key: "handle", value: "my-product", type: "URI" },
        [],
        { isCover: false, isHandle: false },
      ),
    ).toBe(false);
  });

  it("includes URI handle when isHandle=true", () => {
    expect(
      shouldIncludeField(
        { key: "handle", value: "my-product", type: "URI" },
        [],
        { isCover: true, isHandle: true },
      ),
    ).toBe(true);
  });

  it("excludes non-translatable types such as URL", () => {
    expect(
      shouldIncludeField(
        { key: "url", value: "https://example.com", type: "URL" },
        [],
        { isCover: true, isHandle: true },
      ),
    ).toBe(false);
  });
});
