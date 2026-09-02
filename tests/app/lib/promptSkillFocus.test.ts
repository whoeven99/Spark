import { describe, expect, it } from "vitest";
import {
  resolvePromptSkillNames,
  skillNamesFromFocus,
  skillNamesFromUserText,
} from "../../../app/lib/promptSkillFocus";

describe("promptSkillFocus", () => {
  it("maps recommend keys to skill groups including SEO downstream", () => {
    expect(skillNamesFromFocus("seoAudit")).toEqual([
      "seoAudit",
      "bulkSeoEdit",
      "productImprove",
    ]);
    expect(skillNamesFromFocus("bulkPriceImport")).toEqual([
      "bulkPriceImport",
      "sheetImport",
    ]);
    expect(skillNamesFromFocus("all")).toBe("all");
  });

  it("routes freeform SEO / inventory phrases", () => {
    expect(skillNamesFromUserText("帮我给店铺做一次 SEO 体检")).toContain("seoAudit");
    expect(skillNamesFromUserText("检查库存健康情况")).toContain("shopOperations");
    expect(skillNamesFromUserText("今天天气怎么样")).toEqual([]);
  });

  it("prefers explicit skillFocus over userText", () => {
    expect(
      resolvePromptSkillNames({
        skillFocus: "qualityScore",
        userText: "帮我做 SEO 体检",
      }),
    ).toEqual(["productQualityScore", "productImprove"]);
  });
});
