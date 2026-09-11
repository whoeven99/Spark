import { describe, expect, it } from "vitest";
import {
  resolvePromptSkillNames,
  skillNamesFromFocus,
  skillNamesFromUserText,
} from "../../../app/lib/promptSkillFocus";

describe("promptSkillFocus", () => {
  it("maps recommend keys to skill groups including SEO audit", () => {
    expect(skillNamesFromFocus("seoAudit")).toEqual([
      "seoAudit",
      "productImprove",
      "productImport",
    ]);
    expect(skillNamesFromFocus("bulkPriceEdit")).toEqual(["productImport"]);
    expect(skillNamesFromFocus("productExport")).toEqual(["productExport"]);
    expect(skillNamesFromFocus("productImport")).toEqual(["productImport"]);
    expect(skillNamesFromFocus("all")).toBe("all");
  });

  it("routes collection, import and export recommend phrasing", () => {
    expect(skillNamesFromUserText("打开批量调整合集的确认卡，在卡片里选择加入或移出")).toContain(
      "productImport",
    );
    expect(skillNamesFromUserText("帮我把一批商品加入或移出某个手动合集")).toContain(
      "productImport",
    );
    expect(skillNamesFromUserText("Open the bulk collection confirmation card")).toContain(
      "productImport",
    );
    expect(skillNamesFromUserText("打开导入商品确认卡")).toContain("productImport");
    expect(skillNamesFromUserText("帮我批量调价降价 10%")).toContain("productImport");
    expect(skillNamesFromUserText("打开导出商品确认卡")).toContain("productExport");
    expect(skillNamesFromUserText("帮我导出已选商品的 CSV")).toContain("productExport");
    expect(
      skillNamesFromUserText(
        "Open the export confirmation card and choose Shopify CSV or TikTok Catalog Feed.",
      ),
    ).toContain("productExport");
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
