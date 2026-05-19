import { describe, expect, it } from "vitest";
import { buildCopyAllText } from "../../../app/lib/generateDescriptionCopyText";

describe("buildCopyAllText", () => {
  it("formats title and description with fixed labels", () => {
    expect(buildCopyAllText("  My Title  ", "Line1\nLine2")).toBe(
      "Product Title\nMy Title\n\nProduct Description\nLine1\nLine2",
    );
  });

  it("allows empty title after trim", () => {
    expect(buildCopyAllText("   ", "only body")).toBe(
      "Product Title\n\n\nProduct Description\nonly body",
    );
  });
});
