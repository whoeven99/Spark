import { describe, expect, it } from "vitest";
import { mergeGlossaryTerms, parseGlossaryCsv, validateGlossaryTerms } from "../../../../app/server/translation/glossary.server";

describe("parseGlossaryCsv", () => {
  it("parses source, do-not-translate, note, and locale columns", () => {
    const csv = `source,do_not_translate,note,en,fr
闪购,,,Flash Sale,Vente flash
Acme,true,品牌名,,,`;

    const terms = parseGlossaryCsv(csv);
    expect(terms).toHaveLength(2);
    expect(terms[0]).toEqual({
      source: "闪购",
      translations: { en: "Flash Sale", fr: "Vente flash" },
    });
    expect(terms[1]).toEqual({
      source: "Acme",
      doNotTranslate: true,
      note: "品牌名",
    });
  });

  it("throws when header lacks source column", () => {
    expect(() => parseGlossaryCsv("foo,bar\na,b")).toThrow(/source/i);
  });
});

describe("mergeGlossaryTerms", () => {
  it("keeps existing translations when merging", () => {
    const existing = [{ source: "闪购", translations: { en: "Flash Sale" } }];
    const imported = [{ source: "闪购", translations: { fr: "Vente flash", en: "Sale" } }];
    const merged = mergeGlossaryTerms(existing, imported);
    expect(merged[0].translations).toEqual({ fr: "Vente flash", en: "Flash Sale" });
  });
});

describe("validateGlossaryTerms", () => {
  it("rejects empty source strings", () => {
    expect(() => validateGlossaryTerms([{ source: "  " }])).toThrow(/source/i);
  });
});
