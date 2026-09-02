import { describe, expect, it } from "vitest";
import {
  buildBulkInventoryImportChangesetCsv,
  buildBulkInventoryImportEntries,
  buildBulkInventoryImportRollbackCsv,
  buildBulkInventoryImportSummary,
  coerceBulkInventoryImportRows,
  computeBulkInventoryImportRows,
  computeInventoryMatchRate,
  parseBulkInventoryImportLocationId,
  parseBulkInventoryImportMapping,
  type BulkInventoryImportEntry,
  type BulkInventoryImportRow,
  type BulkInventoryImportVariant,
} from "../../../app/lib/bulkInventoryImport";
import { parseImportQuantity } from "../../../app/lib/sheetImport";
import type { SheetRow } from "../../../app/lib/sheetImport";

const LOCATION = { id: "gid://shopify/Location/9" };

function variant(
  overrides: Partial<BulkInventoryImportVariant> = {},
): BulkInventoryImportVariant {
  return {
    variantId: "gid://shopify/ProductVariant/1",
    productId: "gid://shopify/Product/1",
    productTitle: "经典白T",
    variantTitle: "M / 白",
    sku: "TS-M-W",
    inventoryItemId: "gid://shopify/InventoryItem/1",
    tracked: true,
    availableAtLocation: 12,
    ...overrides,
  };
}

function entry(overrides: Partial<BulkInventoryImportEntry> = {}): BulkInventoryImportEntry {
  return { sourceRow: 2, sku: "TS-M-W", quantity: 50, ...overrides };
}

function sheetRow(sku: string, quantity: string, sourceRow = 2): SheetRow {
  return { sourceRow, cells: { SKU: sku, 库存: quantity } };
}

describe("parseImportQuantity", () => {
  it("接受整数与纯零小数位，拒绝真小数和负数", () => {
    expect(parseImportQuantity("50")).toBe(50);
    expect(parseImportQuantity(" 50 ")).toBe(50);
    expect(parseImportQuantity("50.0")).toBe(50);
    expect(parseImportQuantity("50.00")).toBe(50);
    expect(parseImportQuantity("1,200")).toBe(1200);
    expect(parseImportQuantity("0")).toBe(0);
    // 四舍五入到 50 还是 51 都是替商户做决定，宁可报错
    expect(parseImportQuantity("50.5")).toBeNull();
    expect(parseImportQuantity("-3")).toBeNull();
    expect(parseImportQuantity("很多")).toBeNull();
    expect(parseImportQuantity("")).toBeNull();
    // 超出量级上限的多半是把金额列选成了数量列
    expect(parseImportQuantity("99999999")).toBeNull();
  });
});

describe("parseBulkInventoryImportMapping", () => {
  it("缺列或两列相同时报错", () => {
    expect(() => parseBulkInventoryImportMapping({ quantityColumn: "库存" })).toThrow();
    expect(() => parseBulkInventoryImportMapping({ skuColumn: "SKU" })).toThrow();
    expect(() =>
      parseBulkInventoryImportMapping({ skuColumn: "SKU", quantityColumn: "SKU" }),
    ).toThrow();
    expect(
      parseBulkInventoryImportMapping({ skuColumn: " SKU ", quantityColumn: " 库存 " }),
    ).toEqual({ skuColumn: "SKU", quantityColumn: "库存" });
  });
});

describe("parseBulkInventoryImportLocationId", () => {
  it("只接受 Location GID", () => {
    expect(parseBulkInventoryImportLocationId({ locationId: LOCATION.id })).toBe(LOCATION.id);
    expect(() => parseBulkInventoryImportLocationId({})).toThrow();
    expect(() =>
      parseBulkInventoryImportLocationId({ locationId: "gid://shopify/Product/9" }),
    ).toThrow();
  });
});

describe("buildBulkInventoryImportEntries", () => {
  const mapping = { skuColumn: "SKU", quantityColumn: "库存" };

  it("按 SKU / 数量分类出可用条目与问题行", () => {
    const { entries, issues } = buildBulkInventoryImportEntries(
      [
        sheetRow("TS-M-W", "50", 2),
        sheetRow("", "10", 3),
        sheetRow("TS-L-W", "", 4),
        sheetRow("TS-S-W", "abc", 5),
      ],
      mapping,
    );
    expect(entries).toEqual([{ sourceRow: 2, sku: "TS-M-W", quantity: 50 }]);
    expect(issues.map((i) => i.reason)).toEqual([
      "missing_sku",
      "missing_quantity",
      "invalid_quantity",
    ]);
    expect(issues[2].raw).toBe("abc");
  });

  it("文件内重复 SKU 全部作废，不挑一行", () => {
    const { entries, issues } = buildBulkInventoryImportEntries(
      [sheetRow("TS-M-W", "50", 2), sheetRow("ts-m-w", "80", 3)],
      mapping,
    );
    expect(entries).toEqual([]);
    expect(issues.map((i) => i.reason)).toEqual([
      "duplicate_sku_in_file",
      "duplicate_sku_in_file",
    ]);
  });
});

describe("computeBulkInventoryImportRows", () => {
  it("数量相同的行标为跳过", () => {
    const { rows, issues } = computeBulkInventoryImportRows(
      [entry({ quantity: 12 })],
      [variant()],
    );
    expect(issues).toEqual([]);
    expect(rows[0].skipped).toBe(true);
    expect(rows[0].skipReason).toBe("no_change");
  });

  it("数量不同的行记录前后值", () => {
    const { rows } = computeBulkInventoryImportRows([entry()], [variant()]);
    expect(rows[0]).toMatchObject({
      beforeQuantity: 12,
      afterQuantity: 50,
      skipped: false,
    });
    expect(rows[0].notes).toBeUndefined();
  });

  it("变化超过 1000 件时打备注但不阻止写回", () => {
    const { rows } = computeBulkInventoryImportRows(
      [entry({ quantity: 5000 })],
      [variant({ availableAtLocation: 3 })],
    );
    expect(rows[0].skipped).toBe(false);
    expect(rows[0].notes).toEqual(["large_delta"]);
  });

  it("未匹配、SKU 冲突、无库存项、不追踪库存、未在该地点备货都进 issues", () => {
    const { rows, issues } = computeBulkInventoryImportRows(
      [
        entry({ sourceRow: 2, sku: "MISSING" }),
        entry({ sourceRow: 3, sku: "DUP" }),
        entry({ sourceRow: 4, sku: "NO-ITEM" }),
        entry({ sourceRow: 5, sku: "UNTRACKED" }),
        entry({ sourceRow: 6, sku: "ELSEWHERE" }),
      ],
      [
        variant({ sku: "DUP", variantId: "gid://shopify/ProductVariant/2" }),
        variant({ sku: "DUP", variantId: "gid://shopify/ProductVariant/3" }),
        variant({ sku: "NO-ITEM", inventoryItemId: null }),
        variant({ sku: "UNTRACKED", tracked: false }),
        variant({ sku: "ELSEWHERE", availableAtLocation: null }),
      ],
    );
    expect(rows).toEqual([]);
    expect(issues.map((i) => i.reason)).toEqual([
      "sku_not_found",
      "sku_matches_multiple",
      "no_inventory_item",
      "not_tracked",
      "not_stocked_at_location",
    ]);
  });

  it("不追踪库存优先于未备货判定，文案才对得上", () => {
    const { issues } = computeBulkInventoryImportRows(
      [entry({ sku: "UNTRACKED" })],
      [variant({ sku: "UNTRACKED", tracked: false, availableAtLocation: null })],
    );
    expect(issues[0].reason).toBe("not_tracked");
  });
});

describe("buildBulkInventoryImportSummary", () => {
  it("分别累计增加与减少的件数", () => {
    const { rows } = computeBulkInventoryImportRows(
      [
        entry({ sourceRow: 2, sku: "A", quantity: 20 }),
        entry({ sourceRow: 3, sku: "B", quantity: 2 }),
        entry({ sourceRow: 4, sku: "C", quantity: 12 }),
      ],
      [
        variant({ sku: "A", availableAtLocation: 12 }),
        variant({ sku: "B", availableAtLocation: 12 }),
        variant({ sku: "C", availableAtLocation: 12 }),
      ],
    );
    const summary = buildBulkInventoryImportSummary(4, rows, [
      { sourceRow: 5, sku: "D", reason: "sku_not_found" },
    ]);
    expect(summary).toEqual({
      sheetRows: 4,
      matched: 3,
      changed: 2,
      unchanged: 1,
      issues: 1,
      increaseUnits: 8,
      decreaseUnits: 10,
    });
    expect(computeInventoryMatchRate(summary)).toBe(0.75);
  });
});

describe("coerceBulkInventoryImportRows", () => {
  it("丢弃缺 inventoryItemId 或数量不是整数的行", () => {
    const rows = coerceBulkInventoryImportRows([
      {
        inventoryItemId: "gid://shopify/InventoryItem/1",
        beforeQuantity: 1,
        afterQuantity: 5,
        skipped: false,
      },
      { beforeQuantity: 1, afterQuantity: 5 },
      {
        inventoryItemId: "gid://shopify/InventoryItem/2",
        beforeQuantity: 1,
        afterQuantity: 5.5,
      },
      { inventoryItemId: "gid://shopify/InventoryItem/3", beforeQuantity: 1 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].inventoryItemId).toBe("gid://shopify/InventoryItem/1");
  });

  it("只保留已知备注码", () => {
    const rows = coerceBulkInventoryImportRows([
      {
        inventoryItemId: "gid://shopify/InventoryItem/1",
        beforeQuantity: 0,
        afterQuantity: 9,
        notes: ["large_delta", "made_up"],
      },
    ]);
    expect(rows[0].notes).toEqual(["large_delta"]);
  });
});

describe("CSV", () => {
  const rows: BulkInventoryImportRow[] = [
    {
      sourceRow: 2,
      inventoryItemId: "gid://shopify/InventoryItem/1",
      variantId: "gid://shopify/ProductVariant/1",
      productId: "gid://shopify/Product/1",
      productTitle: "经典白T",
      variantTitle: "M / 白",
      sku: "TS-M-W",
      beforeQuantity: 12,
      afterQuantity: 50,
      skipped: false,
    },
    {
      sourceRow: 3,
      inventoryItemId: "gid://shopify/InventoryItem/2",
      variantId: "gid://shopify/ProductVariant/2",
      productId: "gid://shopify/Product/1",
      productTitle: "经典白T",
      variantTitle: "L / 白",
      sku: "TS-L-W",
      beforeQuantity: 8,
      afterQuantity: 8,
      skipped: true,
      skipReason: "no_change",
    },
  ];

  it("变更 CSV 带上 delta 与地点，跳过行不填新值", () => {
    const lines = buildBulkInventoryImportChangesetCsv(rows, LOCATION).split("\n");
    expect(lines[0]).toContain("delta");
    expect(lines[1]).toContain("12,50,38");
    expect(lines[1]).toContain(LOCATION.id);
    expect(lines[2]).toContain("skip");
  });

  it("回滚 CSV 只含真正会被改的行", () => {
    const lines = buildBulkInventoryImportRollbackCsv(rows, LOCATION).trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("TS-M-W");
    expect(lines[1]).toContain("12");
  });
});
