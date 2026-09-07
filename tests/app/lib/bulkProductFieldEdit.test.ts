import { describe, expect, it } from "vitest";
import {
  BulkProductFieldEditRuleError,
  buildBulkProductFieldEditChangesetCsv,
  buildBulkProductFieldEditSummary,
  coerceBulkProductFieldEditRows,
  computeProductFieldChange,
  parseBulkProductFieldEditRule,
  type BulkProductFieldEditProductInput,
} from "../../../app/lib/bulkProductFieldEdit";

const product = (
  overrides: Partial<BulkProductFieldEditProductInput> = {},
): BulkProductFieldEditProductInput => ({
  productId: "gid://shopify/Product/1",
  productTitle: "背包",
  vendor: "Acme",
  productType: "Bag",
  seoTitle: "旧标题",
  seoDescription: "旧描述",
  ...overrides,
});

describe("parseBulkProductFieldEditRule", () => {
  it("解析字段与写入值", () => {
    expect(parseBulkProductFieldEditRule({ field: "vendor", mode: "set", value: "Nike" })).toEqual({
      field: "vendor",
      mode: "set",
      value: "Nike",
    });
  });

  it("没选字段时报错", () => {
    expect(() => parseBulkProductFieldEditRule({ mode: "set", value: "x" })).toThrow(
      BulkProductFieldEditRuleError,
    );
  });

  it("设值但没填内容时报错", () => {
    expect(() => parseBulkProductFieldEditRule({ field: "vendor", mode: "set", value: "" })).toThrow(
      BulkProductFieldEditRuleError,
    );
  });

  it("清空时不要求填写值", () => {
    expect(parseBulkProductFieldEditRule({ field: "seoTitle", mode: "clear" })).toEqual({
      field: "seoTitle",
      mode: "clear",
      value: "",
    });
  });
});

describe("computeProductFieldChange", () => {
  it("vendor 设值产生变更", () => {
    const row = computeProductFieldChange(product(), {
      field: "vendor",
      mode: "set",
      value: "Nike",
    });
    expect(row.skipped).toBe(false);
    expect(row.afterValue).toBe("Nike");
  });

  it("相同值跳过", () => {
    const row = computeProductFieldChange(product(), {
      field: "vendor",
      mode: "set",
      value: "Acme",
    });
    expect(row.skipped).toBe(true);
    expect(row.skipReason).toBe("no_change");
  });

  it("SEO 标题超长跳过", () => {
    const row = computeProductFieldChange(product(), {
      field: "seoTitle",
      mode: "set",
      value: "这是一段明显超过三十个汉字展示宽度的超长搜索标题内容再加几个字",
    });
    expect(row.skipped).toBe(true);
    expect(row.skipReason).toBe("too_long");
  });

  it("清空 SEO 描述", () => {
    const row = computeProductFieldChange(product(), {
      field: "seoDescription",
      mode: "clear",
      value: "",
    });
    expect(row.skipped).toBe(false);
    expect(row.afterValue).toBe("");
  });
});

describe("changeset helpers", () => {
  it("汇总变更与跳过", () => {
    const rows = [
      computeProductFieldChange(product(), { field: "vendor", mode: "set", value: "Nike" }),
      computeProductFieldChange(product({ productId: "2" }), {
        field: "vendor",
        mode: "set",
        value: "Acme",
      }),
    ];
    expect(buildBulkProductFieldEditSummary(rows)).toEqual({
      products: 2,
      changed: 1,
      skipped: 1,
    });
  });

  it("coerce 丢掉缺 id 的脏行", () => {
    expect(
      coerceBulkProductFieldEditRows([
        { productId: "gid://shopify/Product/1", field: "vendor", beforeValue: "a", afterValue: "b" },
        { field: "vendor", afterValue: "x" },
      ]),
    ).toHaveLength(1);
  });

  it("CSV 含表头", () => {
    const csv = buildBulkProductFieldEditChangesetCsv([
      computeProductFieldChange(product(), { field: "vendor", mode: "set", value: "Nike" }),
    ]);
    expect(csv).toContain("product_title");
    expect(csv).toContain("Nike");
  });
});
