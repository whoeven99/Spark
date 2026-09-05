import { describe, expect, it } from "vitest";
import {
  BulkCollectionEditRuleError,
  buildBulkCollectionEditChangesetCsv,
  buildBulkCollectionEditRollbackCsv,
  buildBulkCollectionEditSummary,
  coerceBulkCollectionEditRows,
  computeProductCollectionChange,
  parseBulkCollectionEditRule,
  type BulkCollectionEditProductInput,
  type BulkCollectionEditRule,
} from "../../../app/lib/bulkCollectionEdit";

const COLLECTION_GID = "gid://shopify/Collection/42";

const collection = { id: COLLECTION_GID, title: "夏季清仓" };

const product = (
  overrides: Partial<BulkCollectionEditProductInput> = {},
): BulkCollectionEditProductInput => ({
  productId: "gid://shopify/Product/1",
  productTitle: "测试商品",
  status: "ACTIVE",
  inCollection: false,
  ...overrides,
});

const rule = (overrides: Partial<BulkCollectionEditRule> = {}): BulkCollectionEditRule => ({
  action: "add",
  collectionId: COLLECTION_GID,
  ...overrides,
});

describe("parseBulkCollectionEditRule", () => {
  it("解析方向与目标合集", () => {
    expect(
      parseBulkCollectionEditRule({ collectionAction: "remove", collectionId: COLLECTION_GID }),
    ).toEqual({ action: "remove", collectionId: COLLECTION_GID });
  });

  it("没选方向时报错，不默认加入或移出", () => {
    const cases: Array<Record<string, string>> = [
      { collectionId: COLLECTION_GID },
      { collectionAction: "", collectionId: COLLECTION_GID },
      { collectionAction: "unset", collectionId: COLLECTION_GID },
    ];
    for (const params of cases) {
      try {
        parseBulkCollectionEditRule(params);
        throw new Error("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(BulkCollectionEditRuleError);
        expect((e as BulkCollectionEditRuleError).code).toBe("invalid_action");
      }
    }
  });

  it("没选合集时报错", () => {
    try {
      parseBulkCollectionEditRule({ collectionAction: "add" });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as BulkCollectionEditRuleError).code).toBe("missing_collection");
    }
  });

  it("合集标识不是 Collection GID 时报错，不拿商品 GID 当合集用", () => {
    try {
      parseBulkCollectionEditRule({
        collectionAction: "add",
        collectionId: "gid://shopify/Product/1",
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as BulkCollectionEditRuleError).code).toBe("invalid_collection");
    }
  });
});

describe("computeProductCollectionChange", () => {
  it("不在合集里的商品会被加入", () => {
    const row = computeProductCollectionChange(product(), rule());
    expect(row.beforeInCollection).toBe(false);
    expect(row.afterInCollection).toBe(true);
    expect(row.skipped).toBe(false);
  });

  it("已在合集里的商品在加入方向下跳过", () => {
    const row = computeProductCollectionChange(product({ inCollection: true }), rule());
    expect(row.skipped).toBe(true);
    expect(row.skipReason).toBe("already_in");
    expect(row.afterInCollection).toBe(true);
  });

  it("不在合集里的商品在移出方向下跳过", () => {
    const row = computeProductCollectionChange(product(), rule({ action: "remove" }));
    expect(row.skipped).toBe(true);
    expect(row.skipReason).toBe("not_in");
    expect(row.afterInCollection).toBe(false);
  });

  it("在合集里的商品会被移出", () => {
    const row = computeProductCollectionChange(
      product({ inCollection: true }),
      rule({ action: "remove" }),
    );
    expect(row.afterInCollection).toBe(false);
    expect(row.skipped).toBe(false);
  });

  it("状态统一大写，供审核表按稳定码取文案", () => {
    const row = computeProductCollectionChange(product({ status: "draft" }), rule());
    expect(row.status).toBe("DRAFT");
  });
});

describe("buildBulkCollectionEditSummary", () => {
  it("分别统计加入、移出与跳过", () => {
    const rows = [
      computeProductCollectionChange(product({ productId: "a" }), rule()),
      computeProductCollectionChange(product({ productId: "b", inCollection: true }), rule()),
      computeProductCollectionChange(
        product({ productId: "c", inCollection: true }),
        rule({ action: "remove" }),
      ),
    ];
    expect(buildBulkCollectionEditSummary(rows)).toEqual({
      products: 3,
      changed: 2,
      skipped: 1,
      added: 1,
      removed: 1,
    });
  });
});

describe("coerceBulkCollectionEditRows", () => {
  it("丢弃缺 productId、或前后归属相同的写入行", () => {
    const rows = coerceBulkCollectionEditRows([
      { productId: "", beforeInCollection: false, afterInCollection: true },
      { productId: "a", beforeInCollection: true, afterInCollection: true },
      { productId: "b", beforeInCollection: false, afterInCollection: true, status: "active" },
    ]);
    expect(rows.map((row) => row.productId)).toEqual(["b"]);
    expect(rows[0].status).toBe("ACTIVE");
  });

  it("保留被跳过的行用于展示", () => {
    const rows = coerceBulkCollectionEditRows([
      {
        productId: "a",
        beforeInCollection: true,
        afterInCollection: true,
        skipped: true,
        skipReason: "already_in",
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].skipReason).toBe("already_in");
  });
});

describe("CSV", () => {
  const rows = [
    computeProductCollectionChange(product({ productId: "a", productTitle: "商品, 带逗号" }), rule()),
    computeProductCollectionChange(product({ productId: "b", inCollection: true }), rule()),
  ];

  it("变更清单带上合集与跳过原因，逗号被转义", () => {
    const csv = buildBulkCollectionEditChangesetCsv(rows, collection);
    expect(csv).toContain('"商品, 带逗号"');
    expect(csv).toContain(COLLECTION_GID);
    expect(csv).toContain("no,yes,add");
    expect(csv).toContain("skip,already_in");
  });

  it("回滚清单只含会写入的行，动作与本次相反", () => {
    const csv = buildBulkCollectionEditRollbackCsv(rows, collection);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("remove");
  });
});
