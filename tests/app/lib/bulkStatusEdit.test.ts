import { describe, expect, it } from "vitest";
import {
  BulkStatusEditRuleError,
  buildBulkStatusEditChangesetCsv,
  buildBulkStatusEditRollbackCsv,
  buildBulkStatusEditSummary,
  coerceBulkStatusEditRows,
  computeProductStatusChange,
  parseBulkStatusEditRule,
  type BulkStatusEditProductInput,
  type BulkStatusEditRule,
} from "../../../app/lib/bulkStatusEdit";

const product = (
  overrides: Partial<BulkStatusEditProductInput> = {},
): BulkStatusEditProductInput => ({
  productId: "gid://shopify/Product/1",
  productTitle: "测试商品",
  status: "DRAFT",
  totalInventory: 5,
  tracksInventory: true,
  publishedAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

const rule = (overrides: Partial<BulkStatusEditRule> = {}): BulkStatusEditRule => ({
  targetStatus: "active",
  inventoryCondition: "none",
  ...overrides,
});

describe("parseBulkStatusEditRule", () => {
  it("解析目标状态与库存条件", () => {
    expect(
      parseBulkStatusEditRule({ targetStatus: "draft", inventoryCondition: "out_of_stock_only" }),
    ).toEqual({ targetStatus: "draft", inventoryCondition: "out_of_stock_only" });
  });

  it("没选方向时报错，不默认上架或下架", () => {
    const cases: Array<Record<string, string>> = [{}, { targetStatus: "" }, { targetStatus: "unset" }];
    for (const params of cases) {
      try {
        parseBulkStatusEditRule(params);
        throw new Error("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(BulkStatusEditRuleError);
        expect((e as BulkStatusEditRuleError).code).toBe("invalid_target_status");
      }
    }
  });

  it("库存条件非法时退回不限库存，不阻断任务", () => {
    expect(parseBulkStatusEditRule({ targetStatus: "active", inventoryCondition: "nope" })).toEqual(
      { targetStatus: "active", inventoryCondition: "none" },
    );
  });
});

describe("computeProductStatusChange", () => {
  it("草稿改上架时产生变更", () => {
    const row = computeProductStatusChange(product(), rule());
    expect(row.beforeStatus).toBe("DRAFT");
    expect(row.afterStatus).toBe("ACTIVE");
    expect(row.skipped).toBe(false);
  });

  it("已是目标状态时跳过", () => {
    const row = computeProductStatusChange(product({ status: "ACTIVE" }), rule());
    expect(row.skipped).toBe(true);
    expect(row.skipReason).toBe("no_change");
    expect(row.afterStatus).toBe("ACTIVE");
  });

  it("归档商品一律跳过，不在本能力范围内", () => {
    const row = computeProductStatusChange(product({ status: "ARCHIVED" }), rule());
    expect(row.skipped).toBe(true);
    expect(row.skipReason).toBe("archived_source");
  });

  it("没有 Online Store 发布记录时标记需要人工确认销售渠道", () => {
    const row = computeProductStatusChange(product({ publishedAt: null }), rule());
    expect(row.needsPublishCheck).toBe(true);
  });

  it("下架方向不提示销售渠道", () => {
    const row = computeProductStatusChange(
      product({ status: "ACTIVE", publishedAt: null }),
      rule({ targetStatus: "draft" }),
    );
    expect(row.needsPublishCheck).toBe(false);
    expect(row.afterStatus).toBe("DRAFT");
  });

  it("「只处理断货」不会动还有库存的商品", () => {
    const row = computeProductStatusChange(
      product({ status: "ACTIVE", totalInventory: 3 }),
      rule({ targetStatus: "draft", inventoryCondition: "out_of_stock_only" }),
    );
    expect(row.skipped).toBe(true);
    expect(row.skipReason).toBe("inventory_condition");
  });

  it("不追踪库存的商品不会被当成断货下架", () => {
    const row = computeProductStatusChange(
      product({ status: "ACTIVE", totalInventory: 0, tracksInventory: false }),
      rule({ targetStatus: "draft", inventoryCondition: "out_of_stock_only" }),
    );
    expect(row.skipped).toBe(true);
    expect(row.skipReason).toBe("inventory_untracked");
  });

  it("不限库存时不追踪库存的商品照常处理", () => {
    const row = computeProductStatusChange(
      product({ status: "ACTIVE", totalInventory: 0, tracksInventory: false }),
      rule({ targetStatus: "draft" }),
    );
    expect(row.skipped).toBe(false);
  });

  it("UNLISTED 等未列举状态按普通来源状态处理", () => {
    const row = computeProductStatusChange(product({ status: "unlisted" }), rule());
    expect(row.beforeStatus).toBe("UNLISTED");
    expect(row.afterStatus).toBe("ACTIVE");
    expect(row.skipped).toBe(false);
  });
});

describe("buildBulkStatusEditSummary", () => {
  it("分别统计上架、下架、跳过与待查渠道", () => {
    const rows = [
      computeProductStatusChange(product({ productId: "a", publishedAt: null }), rule()),
      computeProductStatusChange(product({ productId: "b", status: "ACTIVE" }), rule()),
      computeProductStatusChange(
        product({ productId: "c", status: "ACTIVE" }),
        rule({ targetStatus: "draft" }),
      ),
    ];
    expect(buildBulkStatusEditSummary(rows)).toEqual({
      products: 3,
      changed: 2,
      skipped: 1,
      toActive: 1,
      toDraft: 1,
      needsPublishCheck: 1,
    });
  });
});

describe("coerceBulkStatusEditRows", () => {
  it("丢弃缺 productId、目标状态非法或前后同状态的行", () => {
    const rows = coerceBulkStatusEditRows([
      { productId: "", beforeStatus: "DRAFT", afterStatus: "ACTIVE" },
      { productId: "a", beforeStatus: "DRAFT", afterStatus: "ARCHIVED" },
      { productId: "b", beforeStatus: "ACTIVE", afterStatus: "ACTIVE" },
      { productId: "c", beforeStatus: "DRAFT", afterStatus: "ACTIVE", totalInventory: 2 },
    ]);
    expect(rows.map((row) => row.productId)).toEqual(["c"]);
    expect(rows[0].totalInventory).toBe(2);
  });

  it("保留被跳过的行用于展示", () => {
    const rows = coerceBulkStatusEditRows([
      { productId: "a", beforeStatus: "ACTIVE", afterStatus: "ACTIVE", skipped: true, skipReason: "no_change" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].skipReason).toBe("no_change");
  });
});

describe("CSV", () => {
  const rows = [
    computeProductStatusChange(product({ productId: "a", productTitle: "商品, 带逗号" }), rule()),
    computeProductStatusChange(product({ productId: "b", status: "ACTIVE" }), rule()),
  ];

  it("变更清单包含跳过行与原因，逗号被转义", () => {
    const csv = buildBulkStatusEditChangesetCsv(rows);
    expect(csv).toContain('"商品, 带逗号"');
    expect(csv).toContain("DRAFT,ACTIVE");
    expect(csv).toContain("skip,no_change");
  });

  it("回滚清单只含会写入的行，并记录原状态", () => {
    const csv = buildBulkStatusEditRollbackCsv(rows);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("DRAFT");
  });
});
