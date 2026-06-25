import { describe, expect, it } from "vitest";
import { isBraceletStyleId } from "../../../../app/server/bracelet/braceletStyles.server";
import {
  parseVariantNumericId,
} from "../../../../app/server/bracelet/resolveBraceletVariant.server";
import {
  validatePrepareBraceletInput,
} from "../../../../app/server/bracelet/prepareBraceletCart.server";
import { parsePreviewDataUrl } from "../../../../app/server/bracelet/uploadBraceletPreview.server";

describe("braceletStyles", () => {
  it("recognizes valid style ids", () => {
    expect(isBraceletStyleId("classic")).toBe(true);
    expect(isBraceletStyleId("beaded")).toBe(true);
    expect(isBraceletStyleId("other")).toBe(false);
  });
});

describe("parseVariantNumericId", () => {
  it("extracts numeric id from Shopify GID", () => {
    expect(parseVariantNumericId("gid://shopify/ProductVariant/40123456789")).toBe(
      40123456789,
    );
  });

  it("returns null for invalid gid", () => {
    expect(parseVariantNumericId("not-a-gid")).toBeNull();
  });
});

describe("validatePrepareBraceletInput", () => {
  const tinyPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  it("accepts valid payload", () => {
    const result = validatePrepareBraceletInput({
      style: "classic",
      engraving: "LOVE",
      previewDataUrl: tinyPng,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.style).toBe("classic");
      expect(result.input.engraving).toBe("LOVE");
    }
  });

  it("rejects invalid style", () => {
    const result = validatePrepareBraceletInput({
      style: "invalid",
      engraving: "",
      previewDataUrl: tinyPng,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects engraving over limit", () => {
    const result = validatePrepareBraceletInput({
      style: "beaded",
      engraving: "a".repeat(21),
      previewDataUrl: tinyPng,
    });
    expect(result.ok).toBe(false);
  });
});

describe("parsePreviewDataUrl", () => {
  it("parses png data url", () => {
    const buf = parsePreviewDataUrl(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    );
    expect(buf).not.toBeNull();
    expect(buf!.length).toBeGreaterThan(0);
  });

  it("returns null for non-png", () => {
    expect(parsePreviewDataUrl("data:image/jpeg;base64,abc")).toBeNull();
  });
});
