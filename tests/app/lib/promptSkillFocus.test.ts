import { describe, expect, it } from "vitest";
import {
  isBulkEditRecommendKey,
  resolvePromptSkillNames,
  skillNamesFromFocus,
  skillNamesFromUserText,
} from "../../../app/lib/promptSkillFocus";

describe("promptSkillFocus", () => {
  it("identifies bulk-edit recommend keys", () => {
    expect(isBulkEditRecommendKey("bulkPriceImport")).toBe(true);
    expect(isBulkEditRecommendKey("seoAudit")).toBe(false);
    expect(isBulkEditRecommendKey(null)).toBe(false);
  });

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
    expect(skillNamesFromUserText("帮我按表格导入库存")).not.toContain("bulkInventoryImport");
    expect(skillNamesFromUserText("批量修改商品自定义字段")).not.toContain("bulkMetafieldEdit");
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
