import { describe, expect, it } from "vitest";
import { shouldIncludeFieldV2 } from "../../../worker/src/services/translationFilter/shouldIncludeFieldV2.js";

const base = { key: "title", value: "Hello", type: "SINGLE_LINE_TEXT_FIELD" };
const ctx = { module: "PRODUCT", isCover: false, isHandle: false };

describe("shouldIncludeFieldV2", () => {
  it("excludes non-METAFIELD when type is JSON", () => {
    expect(
      shouldIncludeFieldV2(
        { key: "x", value: "{}", type: "JSON" },
        [],
        { ...ctx, module: "PRODUCT" },
      ),
    ).toBe(false);
  });

  it("allows METAFIELD plain text when type is JSON (PHASE2 json body rules deferred)", () => {
    expect(
      shouldIncludeFieldV2(
        { key: "x", value: "Ships in 3 days", type: "JSON" },
        [],
        { ...ctx, module: "METAFIELD" },
      ),
    ).toBe(true);
  });

  it("excludes theme blacklist value", () => {
    expect(
      shouldIncludeFieldV2(
        { key: "section:heading", value: "Heading 1", type: "SINGLE_LINE_TEXT_FIELD" },
        [],
        { ...ctx, module: "ONLINE_STORE_THEME_JSON_TEMPLATE" },
      ),
    ).toBe(false);
  });

  it("excludes METAFIELD suspicious id", () => {
    expect(
      shouldIncludeFieldV2(
        { key: "k", value: "UXxSP8cSmX", type: "SINGLE_LINE_TEXT_FIELD" },
        [],
        { ...ctx, module: "METAFIELD" },
      ),
    ).toBe(false);
  });

  it("excludes METAOBJECT grp__", () => {
    expect(
      shouldIncludeFieldV2(
        { key: "k", value: "foo_grp__bar", type: "SINGLE_LINE_TEXT_FIELD" },
        [],
        { ...ctx, module: "METAOBJECT" },
      ),
    ).toBe(false);
  });

  it("excludes when non-empty translation exists and outdated is not true", () => {
    expect(
      shouldIncludeFieldV2(base, [{ key: "title", outdated: false, value: "Istniejący" }], ctx),
    ).toBe(false);
    expect(shouldIncludeFieldV2(base, [{ key: "title", outdated: null, value: "X" }], ctx)).toBe(false);
    expect(shouldIncludeFieldV2(base, [{ key: "title", outdated: true }], ctx)).toBe(true);
  });

  it("includes when translation key exists but value is empty", () => {
    expect(shouldIncludeFieldV2(base, [{ key: "title", outdated: false, value: "" }], ctx)).toBe(true);
    expect(shouldIncludeFieldV2(base, [{ key: "title", outdated: false }], ctx)).toBe(true);
  });

  it("includes URI handle only when isHandle", () => {
    const handle = { key: "handle", value: "my-product", type: "URI" };
    expect(shouldIncludeFieldV2(handle, [], { ...ctx, isHandle: false })).toBe(false);
    expect(shouldIncludeFieldV2(handle, [], { ...ctx, isHandle: true })).toBe(true);
  });

  it("includes HTML body_html with inline px styles", () => {
    const body = {
      key: "body_html",
      value: '<p style="font-size:16px">Long article body with CSS.</p>',
      type: "HTML",
    };
    expect(shouldIncludeFieldV2(body, [{ key: "title", outdated: false, value: "PL title" }], {
      ...ctx,
      module: "ARTICLE",
    })).toBe(true);
  });
});
