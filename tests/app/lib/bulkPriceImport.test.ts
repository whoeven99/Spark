import { describe, expect, it } from "vitest";
import {
  buildBulkPriceImportChangesetCsv,
  buildBulkPriceImportEntries,
  buildBulkPriceImportIssuesCsv,
  buildBulkPriceImportRollbackCsv,
  buildBulkPriceImportSummary,
  computeBulkPriceImportRows,
  computeMatchRate,
  parseBulkPriceImportMapping,
  parseImportMoneyToCents,
  validateMappingAgainstHeaders,
  BulkPriceImportMappingError,
  type BulkPriceImportMapping,
  type BulkPriceImportSheetRow,
  type BulkPriceImportVariant,
} from "../../../app/lib/bulkPriceImport";

const MAPPING: BulkPriceImportMapping = {
  skuColumn: "SKU",
  priceColumn: "售价",
  compareAtColumn: null,
};

function sheetRow(sourceRow: number, cells: Record<string, string>): BulkPriceImportSheetRow {
  return { sourceRow, cells };
}

function variant(overrides: Partial<BulkPriceImportVariant> = {}): BulkPriceImportVariant {
  return {
    variantId: "gid://shopify/ProductVariant/1",
    productId: "gid://shopify/Product/1",
    productTitle: "无线耳机",
    variantTitle: "默认",
    sku: "ACM-01",
    price: "199.00",
    compareAtPrice: null,
    ...overrides,
  };
}

describe("parseImportMoneyToCents", () => {
  it("解析普通小数与整数", () => {
    expect(parseImportMoneyToCents("179")).toBe(17900);
    expect(parseImportMoneyToCents("179.5")).toBe(17950);
    expect(parseImportMoneyToCents("179.99")).toBe(17999);
  });

  it("剥掉货币符号与空白", () => {
    expect(parseImportMoneyToCents("¥179.00")).toBe(17900);
    expect(parseImportMoneyToCents("$ 179.00")).toBe(17900);
    expect(parseImportMoneyToCents("179.00 元")).toBe(17900);
    expect(parseImportMoneyToCents("  179.00  ")).toBe(17900);
  });

  it("把跟着 3 位数字的单个分隔符当千分位", () => {
    expect(parseImportMoneyToCents("1,299")).toBe(129900);
    expect(parseImportMoneyToCents("1.299")).toBe(129900);
    expect(parseImportMoneyToCents("1,234,567")).toBe(123456700);
  });

  it("把跟着 1-2 位数字的单个逗号当小数点", () => {
    expect(parseImportMoneyToCents("12,50")).toBe(1250);
    expect(parseImportMoneyToCents("12,5")).toBe(1250);
  });

  it("小数打头时不误判成千分位", () => {
    expect(parseImportMoneyToCents("0.500")).toBe(50);
  });

  it("同时有逗号和点时，靠后的是小数点", () => {
    expect(parseImportMoneyToCents("1,299.00")).toBe(129900);
    expect(parseImportMoneyToCents("1.299,00")).toBe(129900);
  });

  it("欧洲的空格千分位", () => {
    expect(parseImportMoneyToCents("1 299,00")).toBe(129900);
  });

  it("解析不出金额时返回 null 而不是猜", () => {
    expect(parseImportMoneyToCents("")).toBeNull();
    expect(parseImportMoneyToCents("待定")).toBeNull();
    expect(parseImportMoneyToCents("-10")).toBeNull();
    expect(parseImportMoneyToCents("12.34.56.78")).toBeNull();
    expect(parseImportMoneyToCents(null)).toBeNull();
  });
});

describe("parseBulkPriceImportMapping", () => {
  it("解析出完整映射", () => {
    const mapping = parseBulkPriceImportMapping({
      skuColumn: " SKU ",
      priceColumn: "售价",
      compareAtColumn: "原价",
    });
    expect(mapping).toEqual({
      skuColumn: "SKU",
      priceColumn: "售价",
      compareAtColumn: "原价",
    });
  });

  it("划线价列留空表示不改", () => {
    const mapping = parseBulkPriceImportMapping({ skuColumn: "SKU", priceColumn: "售价" });
    expect(mapping.compareAtColumn).toBeNull();
  });

  it("缺少必填列时报错", () => {
    expect(() => parseBulkPriceImportMapping({ priceColumn: "售价" })).toThrow(
      BulkPriceImportMappingError,
    );
    expect(() => parseBulkPriceImportMapping({ skuColumn: "SKU" })).toThrow(
      BulkPriceImportMappingError,
    );
  });

  it("价格列与划线价列相同时报错", () => {
    expect(() =>
      parseBulkPriceImportMapping({
        skuColumn: "SKU",
        priceColumn: "售价",
        compareAtColumn: "售价",
      }),
    ).toThrow(BulkPriceImportMappingError);
  });
});

describe("validateMappingAgainstHeaders", () => {
  it("列都存在时通过", () => {
    expect(() => validateMappingAgainstHeaders(MAPPING, ["SKU", "售价", "库存"])).not.toThrow();
  });

  it("列不存在时报错并列出真实表头", () => {
    expect(() => validateMappingAgainstHeaders(MAPPING, ["货号", "价格"])).toThrow(/货号/);
  });
});

describe("buildBulkPriceImportEntries", () => {
  it("解析出合法行", () => {
    const { entries, issues } = buildBulkPriceImportEntries(
      [
        sheetRow(2, { SKU: "ACM-01", 售价: "179.00" }),
        sheetRow(3, { SKU: "ACM-02", 售价: "¥89" }),
      ],
      MAPPING,
    );
    expect(issues).toHaveLength(0);
    expect(entries).toEqual([
      { sourceRow: 2, sku: "ACM-01", priceCents: 17900, compareAtCents: null },
      { sourceRow: 3, sku: "ACM-02", priceCents: 8900, compareAtCents: null },
    ]);
  });

  it("空 SKU、空价格、非法价格分别记问题", () => {
    const { entries, issues } = buildBulkPriceImportEntries(
      [
        sheetRow(2, { SKU: "", 售价: "179" }),
        sheetRow(3, { SKU: "ACM-02", 售价: "" }),
        sheetRow(4, { SKU: "ACM-03", 售价: "面议" }),
      ],
      MAPPING,
    );
    expect(entries).toHaveLength(0);
    expect(issues.map((i) => i.reason)).toEqual([
      "missing_sku",
      "missing_price",
      "invalid_price",
    ]);
    expect(issues[2].raw).toBe("面议");
  });

  it("同一个 SKU 在文件里重复出现时两行都作废", () => {
    const { entries, issues } = buildBulkPriceImportEntries(
      [
        sheetRow(2, { SKU: "ACM-01", 售价: "179" }),
        sheetRow(3, { SKU: "acm-01", 售价: "189" }),
        sheetRow(4, { SKU: "ACM-02", 售价: "99" }),
      ],
      MAPPING,
    );
    expect(entries.map((e) => e.sku)).toEqual(["ACM-02"]);
    expect(issues.filter((i) => i.reason === "duplicate_sku_in_file")).toHaveLength(2);
  });

  it("映射了划线价列时一并解析", () => {
    const { entries } = buildBulkPriceImportEntries(
      [sheetRow(2, { SKU: "ACM-01", 售价: "179", 原价: "299" })],
      { ...MAPPING, compareAtColumn: "原价" },
    );
    expect(entries[0].compareAtCents).toBe(29900);
  });

  it("划线价留空时不改划线价，而不是报错", () => {
    const { entries, issues } = buildBulkPriceImportEntries(
      [sheetRow(2, { SKU: "ACM-01", 售价: "179", 原价: "" })],
      { ...MAPPING, compareAtColumn: "原价" },
    );
    expect(issues).toHaveLength(0);
    expect(entries[0].compareAtCents).toBeNull();
  });
});

describe("computeBulkPriceImportRows", () => {
  const entries = [{ sourceRow: 2, sku: "ACM-01", priceCents: 17900, compareAtCents: null }];

  it("匹配上且价格不同时标记为将修改", () => {
    const { rows, issues } = computeBulkPriceImportRows(entries, [variant()]);
    expect(issues).toHaveLength(0);
    expect(rows[0].priceChanged).toBe(true);
    expect(rows[0].beforePrice).toBe("199.00");
    expect(rows[0].afterPrice).toBe("179.00");
    expect(rows[0].sourceRow).toBe(2);
  });

  it("价格相同时标记为无变化", () => {
    const { rows } = computeBulkPriceImportRows(entries, [variant({ price: "179.00" })]);
    expect(rows[0].skipped).toBe(true);
    expect(rows[0].skipReason).toBe("no_change");
  });

  it("SKU 大小写不敏感地匹配", () => {
    const { rows, issues } = computeBulkPriceImportRows(entries, [variant({ sku: "acm-01" })]);
    expect(issues).toHaveLength(0);
    expect(rows).toHaveLength(1);
  });

  it("店铺里没有该 SKU 时记未匹配", () => {
    const { rows, issues } = computeBulkPriceImportRows(entries, [variant({ sku: "OTHER" })]);
    expect(rows).toHaveLength(0);
    expect(issues[0].reason).toBe("sku_not_found");
    expect(issues[0].sourceRow).toBe(2);
  });

  it("一个 SKU 命中多个变体时不猜，直接报冲突", () => {
    const { rows, issues } = computeBulkPriceImportRows(entries, [
      variant({ variantId: "gid://shopify/ProductVariant/1" }),
      variant({ variantId: "gid://shopify/ProductVariant/2" }),
    ]);
    expect(rows).toHaveLength(0);
    expect(issues[0].reason).toBe("sku_matches_multiple");
  });

  it("新价与现价相差超过 50 倍时打备注", () => {
    const { rows } = computeBulkPriceImportRows(
      [{ sourceRow: 2, sku: "ACM-01", priceCents: 129900, compareAtCents: null }],
      [variant({ price: "1.29" })],
    );
    expect(rows[0].importNote).toBe("suspicious_magnitude");
  });

  it("正常幅度的调价不打备注", () => {
    const { rows } = computeBulkPriceImportRows(entries, [variant()]);
    expect(rows[0].importNote).toBeUndefined();
  });

  it("只改划线价时也算作变更", () => {
    const { rows } = computeBulkPriceImportRows(
      [{ sourceRow: 2, sku: "ACM-01", priceCents: 19900, compareAtCents: 29900 }],
      [variant()],
    );
    expect(rows[0].priceChanged).toBe(false);
    expect(rows[0].compareAtChanged).toBe(true);
    expect(rows[0].skipped).toBe(false);
    expect(rows[0].afterCompareAt).toBe("299.00");
  });
});

describe("buildBulkPriceImportSummary / computeMatchRate", () => {
  it("统计各类计数", () => {
    const { rows } = computeBulkPriceImportRows(
      [
        { sourceRow: 2, sku: "ACM-01", priceCents: 17900, compareAtCents: null },
        { sourceRow: 3, sku: "ACM-02", priceCents: 8900, compareAtCents: null },
      ],
      [
        variant(),
        variant({ variantId: "gid://shopify/ProductVariant/2", sku: "ACM-02", price: "89.00" }),
      ],
    );
    const summary = buildBulkPriceImportSummary(3, rows, [
      { sourceRow: 4, sku: "ACM-09", reason: "sku_not_found" },
    ]);
    expect(summary).toEqual({
      sheetRows: 3,
      matched: 2,
      changed: 1,
      unchanged: 1,
      issues: 1,
    });
    expect(computeMatchRate(summary)).toBeCloseTo(2 / 3);
  });

  it("空表的匹配率是 0 而不是 NaN", () => {
    expect(computeMatchRate({ sheetRows: 0, matched: 0, changed: 0, unchanged: 0, issues: 0 })).toBe(
      0,
    );
  });
});

describe("CSV", () => {
  const { rows } = computeBulkPriceImportRows(
    [
      { sourceRow: 2, sku: "ACM-01", priceCents: 17900, compareAtCents: null },
      { sourceRow: 3, sku: "ACM-02", priceCents: 8900, compareAtCents: null },
    ],
    [
      variant(),
      variant({ variantId: "gid://shopify/ProductVariant/2", sku: "ACM-02", price: "89.00" }),
    ],
  );

  it("变更 CSV 含所有行（包括无变化的）", () => {
    const lines = buildBulkPriceImportChangesetCsv(rows).trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("source_row");
    expect(lines[1]).toContain("change");
    expect(lines[2]).toContain("skip");
  });

  it("回滚 CSV 只含会被真正写入的行，值为写入前原价", () => {
    const lines = buildBulkPriceImportRollbackCsv(rows).trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("199.00");
  });

  it("未写入 CSV 列出问题行", () => {
    const csv = buildBulkPriceImportIssuesCsv([
      { sourceRow: 7, sku: "ACM-09", reason: "sku_not_found" },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("ACM-09");
    expect(lines[1]).toContain("sku_not_found");
  });
});
