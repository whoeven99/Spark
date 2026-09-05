import { describe, expect, it } from "vitest";
import {
  buildBulkCostImportChangesetCsv,
  buildBulkCostImportEntries,
  buildBulkCostImportIssuesCsv,
  buildBulkCostImportRollbackCsv,
  buildBulkCostImportSummary,
  coerceBulkCostImportRows,
  computeBulkCostImportRows,
  computeCostMatchRate,
  computeMarginPercent,
  parseBulkCostImportMapping,
  validateCostMappingAgainstHeaders,
  type BulkCostImportMapping,
  type BulkCostImportVariant,
} from "../../../app/lib/bulkCostImport";
import { SheetImportMappingError, type SheetRow } from "../../../app/lib/sheetImport";

const mapping: BulkCostImportMapping = { skuColumn: "SKU", costColumn: "成本" };

function sheetRow(sourceRow: number, cells: Record<string, string>): SheetRow {
  return { sourceRow, cells };
}

function variant(overrides: Partial<BulkCostImportVariant> = {}): BulkCostImportVariant {
  return {
    variantId: "gid://shopify/ProductVariant/1",
    productId: "gid://shopify/Product/1",
    productTitle: "连衣裙",
    variantTitle: "S",
    sku: "DR-001",
    price: "99.00",
    inventoryItemId: "gid://shopify/InventoryItem/11",
    unitCost: "38.00",
    ...overrides,
  };
}

describe("parseBulkCostImportMapping", () => {
  it("缺列时报错", () => {
    expect(() => parseBulkCostImportMapping({ costColumn: "成本" })).toThrow(
      SheetImportMappingError,
    );
    expect(() => parseBulkCostImportMapping({ skuColumn: "SKU" })).toThrow(
      SheetImportMappingError,
    );
  });

  it("SKU 列与成本列指向同一列时报错", () => {
    expect(() =>
      parseBulkCostImportMapping({ skuColumn: "货号", costColumn: "货号" }),
    ).toThrow(SheetImportMappingError);
  });

  it("正常解析并去掉两端空白", () => {
    expect(parseBulkCostImportMapping({ skuColumn: " SKU ", costColumn: " 成本 " })).toEqual({
      skuColumn: "SKU",
      costColumn: "成本",
    });
  });
});

describe("validateCostMappingAgainstHeaders", () => {
  it("映射到不存在的列时报错并列出真实表头", () => {
    expect(() => validateCostMappingAgainstHeaders(mapping, ["货号", "采购价"])).toThrow(
      /货号、采购价/,
    );
  });

  it("列都存在时通过", () => {
    expect(() =>
      validateCostMappingAgainstHeaders(mapping, ["SKU", "成本", "备注"]),
    ).not.toThrow();
  });
});

describe("computeMarginPercent", () => {
  it("按（售价 − 成本）÷ 售价 计算，保留一位小数", () => {
    expect(computeMarginPercent(10000, 4200)).toBe(58);
    expect(computeMarginPercent(9900, 4200)).toBe(57.6);
  });

  it("成本高于售价时为负", () => {
    expect(computeMarginPercent(3900, 4500)).toBe(-15.4);
  });

  it("售价缺失或为 0 时返回 null，不做除零", () => {
    expect(computeMarginPercent(null, 4200)).toBeNull();
    expect(computeMarginPercent(0, 4200)).toBeNull();
    expect(computeMarginPercent(9900, null)).toBeNull();
  });
});

describe("buildBulkCostImportEntries", () => {
  it("解析出成本并保留原始行号", () => {
    const { entries, issues } = buildBulkCostImportEntries(
      [sheetRow(2, { SKU: "DR-001", 成本: "¥1,299.50" })],
      mapping,
    );
    expect(issues).toEqual([]);
    expect(entries).toEqual([{ sourceRow: 2, sku: "DR-001", costCents: 129950 }]);
  });

  it("空 SKU、空成本与非法成本各自报错且不进入 entries", () => {
    const { entries, issues } = buildBulkCostImportEntries(
      [
        sheetRow(2, { SKU: "", 成本: "10" }),
        sheetRow(3, { SKU: "A", 成本: "  " }),
        sheetRow(4, { SKU: "B", 成本: "面议" }),
      ],
      mapping,
    );
    expect(entries).toEqual([]);
    expect(issues.map((i) => i.reason)).toEqual([
      "missing_sku",
      "missing_cost",
      "invalid_cost",
    ]);
    expect(issues[2].raw).toBe("面议");
  });

  it("同一 SKU 在文件里重复出现时全部作废", () => {
    const { entries, issues } = buildBulkCostImportEntries(
      [
        sheetRow(2, { SKU: "DR-001", 成本: "10" }),
        sheetRow(3, { SKU: "dr-001", 成本: "20" }),
        sheetRow(4, { SKU: "OK-1", 成本: "30" }),
      ],
      mapping,
    );
    expect(entries.map((e) => e.sku)).toEqual(["OK-1"]);
    expect(issues.filter((i) => i.reason === "duplicate_sku_in_file")).toHaveLength(2);
  });
});

describe("computeBulkCostImportRows", () => {
  const entry = { sourceRow: 2, sku: "DR-001", costCents: 4200 };

  it("算出前后成本与前后毛利率", () => {
    const { rows } = computeBulkCostImportRows([entry], [variant()]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      beforeCost: "38.00",
      afterCost: "42.00",
      price: "99.00",
      beforeMarginPercent: 61.6,
      afterMarginPercent: 57.6,
      skipped: false,
    });
    expect(rows[0].notes).toBeUndefined();
  });

  it("原本没有成本时 beforeCost 为空串而不是 0", () => {
    const { rows } = computeBulkCostImportRows([entry], [variant({ unitCost: null })]);
    expect(rows[0].beforeCost).toBe("");
    expect(rows[0].beforeMarginPercent).toBeNull();
  });

  it("成本没变时标记为跳过", () => {
    const { rows } = computeBulkCostImportRows(
      [{ ...entry, costCents: 3800 }],
      [variant()],
    );
    expect(rows[0].skipped).toBe(true);
    expect(rows[0].skipReason).toBe("no_change");
  });

  it("成本高于售价时打负毛利备注但仍可写回", () => {
    const { rows } = computeBulkCostImportRows(
      [{ ...entry, costCents: 12000 }],
      [variant()],
    );
    expect(rows[0].skipped).toBe(false);
    expect(rows[0].notes).toContain("negative_margin");
    expect(rows[0].afterMarginPercent).toBeLessThan(0);
  });

  it("新旧成本相差过大时打数量级异常备注", () => {
    const { rows } = computeBulkCostImportRows(
      [{ ...entry, costCents: 3800000 }],
      [variant()],
    );
    expect(rows[0].notes).toContain("suspicious_magnitude");
  });

  it("SKU 查不到时报未匹配", () => {
    const { rows, issues } = computeBulkCostImportRows([entry], []);
    expect(rows).toEqual([]);
    expect(issues[0].reason).toBe("sku_not_found");
  });

  it("一个 SKU 命中多个变体时报冲突而不是挑一个", () => {
    const { rows, issues } = computeBulkCostImportRows(
      [entry],
      [
        variant(),
        variant({
          variantId: "gid://shopify/ProductVariant/2",
          inventoryItemId: "gid://shopify/InventoryItem/22",
        }),
      ],
    );
    expect(rows).toEqual([]);
    expect(issues[0].reason).toBe("sku_matches_multiple");
  });

  it("变体没有 inventoryItem 时报错，不产出无法写回的行", () => {
    const { rows, issues } = computeBulkCostImportRows(
      [entry],
      [variant({ inventoryItemId: null })],
    );
    expect(rows).toEqual([]);
    expect(issues[0].reason).toBe("no_inventory_item");
  });

  it("SKU 大小写不同也能匹配上", () => {
    const { rows } = computeBulkCostImportRows(
      [{ ...entry, sku: "dr-001" }],
      [variant({ sku: "DR-001" })],
    );
    expect(rows).toHaveLength(1);
  });
});

describe("buildBulkCostImportSummary", () => {
  it("分别统计变更、无变化、问题与负毛利行", () => {
    const { rows } = computeBulkCostImportRows(
      [
        { sourceRow: 2, sku: "DR-001", costCents: 4200 },
        { sourceRow: 3, sku: "DR-002", costCents: 3800 },
        { sourceRow: 4, sku: "DR-003", costCents: 12000 },
      ],
      [
        variant(),
        variant({
          variantId: "gid://shopify/ProductVariant/2",
          inventoryItemId: "gid://shopify/InventoryItem/22",
          sku: "DR-002",
        }),
        variant({
          variantId: "gid://shopify/ProductVariant/3",
          inventoryItemId: "gid://shopify/InventoryItem/33",
          sku: "DR-003",
        }),
      ],
    );
    const summary = buildBulkCostImportSummary(5, rows, [
      { sourceRow: 6, sku: "X", reason: "sku_not_found" },
    ]);
    expect(summary).toEqual({
      sheetRows: 5,
      matched: 3,
      changed: 2,
      unchanged: 1,
      issues: 1,
      negativeMargin: 1,
    });
  });
});

describe("computeCostMatchRate", () => {
  it("表格为空时返回 0 而不是 NaN", () => {
    expect(
      computeCostMatchRate({
        sheetRows: 0,
        matched: 0,
        changed: 0,
        unchanged: 0,
        issues: 0,
        negativeMargin: 0,
      }),
    ).toBe(0);
  });

  it("按已匹配 ÷ 表格有效行计算", () => {
    expect(
      computeCostMatchRate({
        sheetRows: 10,
        matched: 4,
        changed: 4,
        unchanged: 0,
        issues: 6,
        negativeMargin: 0,
      }),
    ).toBe(0.4);
  });
});

describe("coerceBulkCostImportRows", () => {
  it("丢弃缺 inventoryItemId 或缺新成本的行", () => {
    const rows = coerceBulkCostImportRows([
      { inventoryItemId: "gid://shopify/InventoryItem/11", afterCost: "42.00" },
      { inventoryItemId: "", afterCost: "42.00" },
      { inventoryItemId: "gid://shopify/InventoryItem/22", afterCost: "" },
      "not an object",
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].inventoryItemId).toBe("gid://shopify/InventoryItem/11");
  });

  it("只保留已知的备注码", () => {
    const rows = coerceBulkCostImportRows([
      {
        inventoryItemId: "gid://shopify/InventoryItem/11",
        afterCost: "42.00",
        notes: ["negative_margin", "made_up"],
      },
    ]);
    expect(rows[0].notes).toEqual(["negative_margin"]);
  });
});

describe("CSV", () => {
  const { rows } = computeBulkCostImportRows(
    [
      { sourceRow: 2, sku: "DR-001", costCents: 4200 },
      { sourceRow: 3, sku: "DR-002", costCents: 3800 },
    ],
    [
      variant(),
      variant({
        variantId: "gid://shopify/ProductVariant/2",
        inventoryItemId: "gid://shopify/InventoryItem/22",
        sku: "DR-002",
      }),
    ],
  );

  it("变更清单包含全部行（含无变化的）", () => {
    const lines = buildBulkCostImportChangesetCsv(rows).trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("after_margin_percent");
    expect(lines[1]).toContain("change");
    expect(lines[2]).toContain("skip");
  });

  it("回滚清单只含真正会被改的行，并记录写回前的成本", () => {
    const lines = buildBulkCostImportRollbackCsv(rows).trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("38.00");
  });

  it("未写入清单带上原始单元格文本便于回表定位", () => {
    const csv = buildBulkCostImportIssuesCsv([
      { sourceRow: 7, sku: "X-1", reason: "invalid_cost", raw: "面议" },
    ]);
    expect(csv).toContain("面议");
    expect(csv).toContain("invalid_cost");
  });
});
