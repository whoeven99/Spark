import { describe, expect, it } from "vitest";
import {
  BULK_SEO_TITLE_MAX_LENGTH,
  BulkSeoEditRuleError,
  buildBulkSeoEditChangesetCsv,
  buildBulkSeoEditRollbackCsv,
  buildBulkSeoEditSummary,
  coerceBulkSeoEditRows,
  computeProductSeoChange,
  parseBulkSeoEditRule,
  renderSeoTemplate,
  truncateSeoValue,
  type BulkSeoEditProductInput,
  type BulkSeoEditRule,
} from "../../../app/lib/bulkSeoEdit";

function product(overrides: Partial<BulkSeoEditProductInput> = {}): BulkSeoEditProductInput {
  return {
    productId: "gid://shopify/Product/1",
    productTitle: "Wireless Earbuds",
    vendor: "Acme",
    productType: "Audio",
    seoTitle: null,
    seoDescription: null,
    ...overrides,
  };
}

function rule(overrides: Partial<BulkSeoEditRule> = {}): BulkSeoEditRule {
  return {
    titleTemplate: "{title} - {vendor}",
    descriptionTemplate: null,
    onlyFillEmpty: false,
    overflow: "truncate",
    ...overrides,
  };
}

describe("renderSeoTemplate", () => {
  it("替换全部占位符", () => {
    expect(renderSeoTemplate("{title} - {vendor} | {productType}", product())).toBe(
      "Wireless Earbuds - Acme | Audio",
    );
  });

  it("占位符取值为空时不留下孤立分隔符", () => {
    const result = renderSeoTemplate("{title} - {vendor} | 正品", product({ vendor: null }));
    expect(result).toBe("Wireless Earbuds - 正品");
  });

  it("模板尾部占位符为空时清掉结尾分隔符", () => {
    expect(renderSeoTemplate("{title} - {vendor}", product({ vendor: null }))).toBe(
      "Wireless Earbuds",
    );
  });
});

describe("truncateSeoValue", () => {
  it("不超长时原样返回", () => {
    expect(truncateSeoValue("abc", 10)).toBe("abc");
  });

  it("切在词中间时退回词边界并清掉尾部分隔符", () => {
    expect(truncateSeoValue("abcdef - ghi", 10)).toBe("abcdef");
  });

  it("无空格文本退不回词边界时硬截断，不会被砍到几乎为空", () => {
    expect(truncateSeoValue("无线蓝牙耳机降噪长续航", 6)).toHaveLength(6);
  });

  it("退回词边界会丢掉过多内容时保留硬截断结果", () => {
    // 唯一的空格在很靠前的位置，退回去只剩 1 个字符，不划算
    expect(truncateSeoValue("a bcdefghijklmn", 10)).toBe("a bcdefghi");
  });
});

describe("parseBulkSeoEditRule", () => {
  it("解析模板与开关", () => {
    const parsed = parseBulkSeoEditRule({
      titleTemplate: " {title} | {vendor} ",
      descriptionTemplate: "",
      onlyFillEmpty: "true",
      overflow: "skip",
    });
    expect(parsed).toEqual({
      titleTemplate: "{title} | {vendor}",
      descriptionTemplate: null,
      onlyFillEmpty: true,
      overflow: "skip",
    });
  });

  it("拒绝未知占位符，避免把字面量写进 SEO", () => {
    expect(() => parseBulkSeoEditRule({ titleTemplate: "{title} - {brand}" })).toThrow(
      BulkSeoEditRuleError,
    );
  });

  it("两个模板都为空时拒绝创建任务", () => {
    expect(() => parseBulkSeoEditRule({})).toThrow(BulkSeoEditRuleError);
  });

  it("overflow 缺省为 truncate", () => {
    expect(parseBulkSeoEditRule({ titleTemplate: "{title}" }).overflow).toBe("truncate");
  });
});

describe("computeProductSeoChange", () => {
  it("为空的 SEO 标题填入渲染结果", () => {
    const row = computeProductSeoChange(product(), rule());
    expect(row.titleChanged).toBe(true);
    expect(row.afterSeoTitle).toBe("Wireless Earbuds - Acme");
    expect(row.skipped).toBe(false);
  });

  it("渲染结果与现值相同时跳过", () => {
    const row = computeProductSeoChange(
      product({ seoTitle: "Wireless Earbuds - Acme" }),
      rule(),
    );
    expect(row.skipped).toBe(true);
    expect(row.skipReason).toBe("no_change");
  });

  it("onlyFillEmpty 不覆盖商户已写的 SEO", () => {
    const row = computeProductSeoChange(
      product({ seoTitle: "商户自己写的标题" }),
      rule({ onlyFillEmpty: true }),
    );
    expect(row.titleChanged).toBe(false);
    expect(row.skipReason).toBe("already_filled");
    expect(row.afterSeoTitle).toBe("商户自己写的标题");
  });

  it("超长时按 truncate 截断并标注", () => {
    const row = computeProductSeoChange(
      product({ productTitle: "A".repeat(80) }),
      rule({ titleTemplate: "{title}" }),
    );
    expect(row.titleChanged).toBe(true);
    expect(row.afterSeoTitle).toHaveLength(BULK_SEO_TITLE_MAX_LENGTH);
    expect(row.notes).toContain("title_truncated");
  });

  it("超长时按 skip 保持原值不改", () => {
    const row = computeProductSeoChange(
      product({ productTitle: "A".repeat(80) }),
      rule({ titleTemplate: "{title}", overflow: "skip" }),
    );
    expect(row.titleChanged).toBe(false);
    expect(row.notes).toContain("title_too_long");
  });

  it("渲染为空时跳过而不是写入空值", () => {
    const row = computeProductSeoChange(
      product({ vendor: null }),
      rule({ titleTemplate: "{vendor}" }),
    );
    expect(row.titleChanged).toBe(false);
    expect(row.skipReason).toBe("empty_result");
  });

  it("标题与描述可以独立变更", () => {
    const row = computeProductSeoChange(
      product({ seoTitle: "Wireless Earbuds - Acme" }),
      rule({ descriptionTemplate: "{vendor} 出品的 {title}" }),
    );
    expect(row.titleChanged).toBe(false);
    expect(row.descriptionChanged).toBe(true);
    expect(row.afterSeoDescription).toBe("Acme 出品的 Wireless Earbuds");
    expect(row.skipped).toBe(false);
  });
});

describe("buildBulkSeoEditSummary", () => {
  it("分别统计标题与描述的写入数", () => {
    const rows = [
      computeProductSeoChange(product(), rule({ descriptionTemplate: "{title} desc" })),
      computeProductSeoChange(
        product({ productId: "gid://shopify/Product/2", seoTitle: "Wireless Earbuds - Acme" }),
        rule(),
      ),
    ];
    expect(buildBulkSeoEditSummary(rows)).toEqual({
      products: 2,
      changed: 1,
      skipped: 1,
      titleChanges: 1,
      descriptionChanges: 1,
    });
  });
});

describe("coerceBulkSeoEditRows", () => {
  it("丢弃声称要改却没有目标值的行", () => {
    const rows = coerceBulkSeoEditRows([
      { productId: "gid://shopify/Product/1", titleChanged: true, afterSeoTitle: "  " },
      { productId: "gid://shopify/Product/2", titleChanged: true, afterSeoTitle: "ok" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].productId).toBe("gid://shopify/Product/2");
  });

  it("丢弃既没变更也没跳过标记的行", () => {
    expect(coerceBulkSeoEditRows([{ productId: "gid://shopify/Product/1" }])).toHaveLength(0);
  });

  it("非数组输入返回空数组", () => {
    expect(coerceBulkSeoEditRows(null)).toEqual([]);
  });
});

describe("CSV", () => {
  it("变更 CSV 含表头与被跳过行的原因", () => {
    const rows = [
      computeProductSeoChange(product(), rule()),
      computeProductSeoChange(
        product({ productId: "gid://shopify/Product/2", seoTitle: "Wireless Earbuds - Acme" }),
        rule(),
      ),
    ];
    const csv = buildBulkSeoEditChangesetCsv(rows);
    expect(csv.trim().split("\n")).toHaveLength(3);
    expect(csv).toContain("before_seo_title");
    expect(csv).toContain("no_change");
  });

  it("回滚 CSV 只含会写入的行，并记录原值", () => {
    const rows = [
      computeProductSeoChange(product({ seoTitle: "旧标题" }), rule()),
      computeProductSeoChange(
        product({ productId: "gid://shopify/Product/2", seoTitle: "Wireless Earbuds - Acme" }),
        rule(),
      ),
    ];
    const lines = buildBulkSeoEditRollbackCsv(rows).trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("旧标题");
  });
});
