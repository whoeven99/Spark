import { describe, expect, it } from "vitest";
import { validateGlossaryTerms } from "../../../../app/server/translation/glossary.server";

describe("validateGlossaryTerms", () => {
  it("rejects empty source strings", () => {
    expect(() => validateGlossaryTerms([{ source: "  " }])).toThrow(/source/i);
  });

  it("normalizes valid terms", () => {
    const terms = validateGlossaryTerms([
      { source: " 闪购 ", translations: { en: " Flash Sale " }, note: " promo " },
    ]);
    expect(terms).toEqual([
      { source: "闪购", translations: { en: "Flash Sale" }, note: "promo" },
    ]);
  });
});
