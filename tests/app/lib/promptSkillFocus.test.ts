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
    expect(skillNamesFromFocus("todayPulse")).toEqual([
      "shopOperations",
      "healthDiagnosisForm",
    ]);
    expect(skillNamesFromFocus("bulkPriceEdit")).toEqual(["bulkPriceEdit"]);
    expect(skillNamesFromFocus("bulkTagEdit")).toEqual(["bulkTagEdit"]);
    expect(skillNamesFromFocus("bulkStatusEdit")).toEqual(["bulkStatusEdit"]);
    expect(skillNamesFromFocus("productExport")).toEqual(["productExport"]);
    expect(skillNamesFromFocus("productImport")).toEqual(["productImport"]);
    expect(skillNamesFromFocus("skuExport")).toEqual(["skuExport"]);
    expect(skillNamesFromFocus("inventoryExport")).toEqual(["inventoryExport"]);
    expect(skillNamesFromFocus("inventoryImport")).toEqual(["inventoryImport"]);
    expect(skillNamesFromFocus("inventoryQtyEdit")).toEqual(["inventoryQtyEdit"]);
    expect(skillNamesFromFocus("all")).toBe("all");
  });

  it("routes freeform SEO / inventory / today pulse phrases", () => {
    expect(skillNamesFromUserText("帮我给店铺做一次 SEO 体检")).toContain("seoAudit");
    expect(skillNamesFromUserText("检查库存健康情况")).toContain("shopOperations");
    expect(skillNamesFromUserText("今天店里怎么样")).toEqual([
      "shopOperations",
      "healthDiagnosisForm",
    ]);
    expect(skillNamesFromUserText("今天天气怎么样")).toEqual([]);
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
    expect(skillNamesFromUserText("第 3 行怎么改")).toContain("productImport");
    expect(skillNamesFromUserText("校验结果")).toContain("productImport");
    expect(skillNamesFromUserText("帮我批量调价降价 10%")).toEqual(["bulkPriceEdit"]);
    expect(
      skillNamesFromUserText("帮我批量调整商品价格，先确认调价规则和商品范围，再给我变更预览，不要直接写回。"),
    ).toEqual(["bulkPriceEdit"]);
    expect(skillNamesFromUserText("帮我调整已选中商品的价格，先给我变更预览")).toEqual([
      "bulkPriceEdit",
    ]);
    expect(skillNamesFromUserText("批量打标")).toEqual(["bulkTagEdit"]);
    expect(skillNamesFromUserText("帮我批量修改商品标签，先确认要加/去掉哪些标签")).toEqual([
      "bulkTagEdit",
    ]);
    expect(skillNamesFromUserText("帮我修改已选中商品的标签，先给我变更预览")).toEqual([
      "bulkTagEdit",
    ]);
    expect(skillNamesFromUserText("批量上下架")).toEqual(["bulkStatusEdit"]);
    expect(skillNamesFromUserText("帮我批量上下架商品，先确认是要上架还是下架")).toEqual([
      "bulkStatusEdit",
    ]);
    expect(skillNamesFromUserText("帮我修改已选中商品的上下架状态，先确认方向")).toEqual([
      "bulkStatusEdit",
    ]);
    expect(skillNamesFromUserText("批量改成本")).toContain("productImport");
    expect(skillNamesFromUserText("批量删除商品")).toContain("productImport");
    expect(skillNamesFromUserText("批量改标题")).toEqual(["productImport"]);
    expect(skillNamesFromUserText("帮我改标题")).toContain("productImprove");
    expect(skillNamesFromUserText("帮我改标题")).not.toContain("productImport");
    expect(skillNamesFromUserText("打开导出商品确认卡")).toContain("productExport");
    expect(skillNamesFromUserText("帮我导出已选商品的 CSV")).toContain("productExport");
    expect(skillNamesFromUserText("帮我导出 SKU 对照表")).toEqual(["skuExport"]);
    expect(skillNamesFromUserText("帮我导出库存")).toContain("inventoryExport");
    expect(skillNamesFromUserText("帮我导入库存 CSV")).toContain("inventoryImport");
    expect(skillNamesFromUserText("帮我设置库存")).toEqual(["inventoryQtyEdit"]);
    expect(
      skillNamesFromUserText(
        "Open the export confirmation card and choose Shopify, TikTok Ads catalog, TikTok Shop, Amazon, or Temu format.",
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
