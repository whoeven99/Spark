import { describe, expect, it } from "vitest";
import {
  BULK_TAG_EDIT_MAX_TAGS_PER_PRODUCT,
  BulkTagEditRuleError,
  buildBulkTagEditChangesetCsv,
  buildBulkTagEditRollbackCsv,
  buildBulkTagEditSummary,
  coerceBulkTagEditRows,
  computeProductTagChange,
  normalizeTags,
  parseBulkTagEditRule,
  type BulkTagEditRule,
} from "../../../app/lib/bulkTagEdit";

const product = (tags: string[]) => ({
  productId: "gid://shopify/Product/1",
  productTitle: "测试商品",
  tags,
});

const rule = (overrides: Partial<BulkTagEditRule> = {}): BulkTagEditRule => ({
  addTags: [],
  removeTags: [],
  removePrefixes: [],
  ...overrides,
});

describe("normalizeTags", () => {
  it("去空白、去空串，并按大小写不敏感去重（保留首次形态）", () => {
    expect(normalizeTags([" Sale ", "sale", "", "  ", "新品"])).toEqual(["Sale", "新品"]);
  });
});

describe("parseBulkTagEditRule", () => {
  it("按逗号拆分三类参数", () => {
    const parsed = parseBulkTagEditRule({
      addTags: "夏季清仓, 包邮",
      removeTags: "新品",
      removePrefixes: "sale-",
    });
    expect(parsed).toEqual({
      addTags: ["夏季清仓", "包邮"],
      removeTags: ["新品"],
      removePrefixes: ["sale-"],
    });
  });

  it("三个参数都为空时报 no_op_rule", () => {
    expect(() => parseBulkTagEditRule({})).toThrow(BulkTagEditRuleError);
    try {
      parseBulkTagEditRule({ addTags: " , ", removeTags: "" });
    } catch (e) {
      expect((e as BulkTagEditRuleError).code).toBe("no_op_rule");
    }
  });

  it("同一标签同时出现在加与减时报错，不猜用户意图", () => {
    try {
      parseBulkTagEditRule({ addTags: "Sale", removeTags: "sale" });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as BulkTagEditRuleError).code).toBe("conflicting_tag");
    }
  });

  it("前缀过短时报错，避免误删大量标签", () => {
    try {
      parseBulkTagEditRule({ removePrefixes: "s" });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as BulkTagEditRuleError).code).toBe("prefix_too_short");
    }
  });

  it("单个标签超长时报错", () => {
    try {
      parseBulkTagEditRule({ addTags: "x".repeat(256) });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as BulkTagEditRuleError).code).toBe("tag_too_long");
    }
  });
});

describe("computeProductTagChange", () => {
  it("添加不存在的标签", () => {
    const row = computeProductTagChange(product(["新品"]), rule({ addTags: ["夏季清仓"] }));
    expect(row.addedTags).toEqual(["夏季清仓"]);
    expect(row.removedTags).toEqual([]);
    expect(row.afterTags).toEqual(["新品", "夏季清仓"]);
    expect(row.skipped).toBe(false);
  });

  it("已有同名标签（大小写不同）时视为无变化", () => {
    const row = computeProductTagChange(product(["Sale"]), rule({ addTags: ["sale"] }));
    expect(row.addedTags).toEqual([]);
    expect(row.skipped).toBe(true);
    expect(row.skipReason).toBe("no_change");
  });

  it("按前缀清理时大小写不敏感", () => {
    const row = computeProductTagChange(
      product(["SALE-summer", "sale-2026", "新品"]),
      rule({ removePrefixes: ["sale-"] }),
    );
    expect(row.removedTags).toEqual(["SALE-summer", "sale-2026"]);
    expect(row.afterTags).toEqual(["新品"]);
  });

  it("要添加的标签不会被前缀规则顺手删掉：加优先于减", () => {
    const row = computeProductTagChange(
      product(["sale-2026"]),
      rule({ addTags: ["sale-2027"], removePrefixes: ["sale-"] }),
    );
    expect(row.removedTags).toEqual(["sale-2026"]);
    expect(row.addedTags).toEqual(["sale-2027"]);
    expect(row.afterTags).toEqual(["sale-2027"]);
  });

  it("要移除的标签本来就没有时视为无变化", () => {
    const row = computeProductTagChange(product(["新品"]), rule({ removeTags: ["清仓"] }));
    expect(row.skipped).toBe(true);
    expect(row.skipReason).toBe("no_change");
  });

  it("结果超出标签上限时跳过并保持原样", () => {
    const existing = Array.from({ length: BULK_TAG_EDIT_MAX_TAGS_PER_PRODUCT }, (_, i) => `t${i}`);
    const row = computeProductTagChange(product(existing), rule({ addTags: ["再加一个"] }));
    expect(row.skipped).toBe(true);
    expect(row.skipReason).toBe("too_many_tags");
    expect(row.afterTags).toEqual(existing);
    expect(row.addedTags).toEqual([]);
  });
});

describe("buildBulkTagEditSummary", () => {
  it("changed 数商品、added/removed 数标签操作次数", () => {
    const rows = [
      computeProductTagChange(product(["a"]), rule({ addTags: ["x", "y"] })),
      computeProductTagChange(product(["b", "c"]), rule({ removeTags: ["b", "c"] })),
      computeProductTagChange(product(["z"]), rule({ addTags: ["z"] })),
    ];
    expect(buildBulkTagEditSummary(rows)).toEqual({
      products: 3,
      changed: 2,
      skipped: 1,
      added: 2,
      removed: 2,
    });
  });
});

describe("coerceBulkTagEditRows", () => {
  it("丢弃缺 productId 的行", () => {
    expect(coerceBulkTagEditRows([{ addedTags: ["x"] }])).toEqual([]);
  });

  it("丢弃声称要改却没有任何标签变更的行", () => {
    const rows = coerceBulkTagEditRows([
      { productId: "gid://shopify/Product/1", skipped: false, addedTags: [], removedTags: [] },
    ]);
    expect(rows).toEqual([]);
  });

  it("保留合法行并归一化标签", () => {
    const rows = coerceBulkTagEditRows([
      {
        productId: "gid://shopify/Product/1",
        productTitle: "商品",
        beforeTags: [" a ", "a"],
        afterTags: ["a", "b"],
        addedTags: ["b"],
        removedTags: [],
        skipped: false,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].beforeTags).toEqual(["a"]);
    expect(rows[0].addedTags).toEqual(["b"]);
  });
});

describe("CSV", () => {
  const rows = [
    computeProductTagChange(product(["新品", "sale-2026"]), rule({ addTags: ["夏季清仓"], removePrefixes: ["sale-"] })),
    computeProductTagChange(product(["夏季清仓"]), rule({ addTags: ["夏季清仓"] })),
  ];

  it("变更 CSV 含跳过行与原因", () => {
    const csv = buildBulkTagEditChangesetCsv(rows);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(
      "product_title,product_id,before_tags,after_tags,added_tags,removed_tags,action,reason",
    );
    expect(lines[1]).toContain("change");
    expect(lines[2]).toContain("skip");
    expect(lines[2]).toContain("no_change");
  });

  it("含逗号的标签列表被正确加引号", () => {
    const csv = buildBulkTagEditChangesetCsv(rows);
    expect(csv).toContain('"新品, sale-2026"');
  });

  it("回滚 CSV 是反向操作且只含会写入的行", () => {
    const csv = buildBulkTagEditRollbackCsv(rows);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("product_id,product_title,rollback_add_tags,rollback_remove_tags");
    expect(lines).toHaveLength(2);
    // 原操作是「加 夏季清仓 / 减 sale-2026」，回滚就是「加回 sale-2026 / 去掉 夏季清仓」
    expect(lines[1]).toContain("sale-2026");
    expect(lines[1]).toContain("夏季清仓");
  });
});
