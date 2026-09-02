import { describe, expect, it } from "vitest";
import {
  buildBulkMetafieldEditChangesetCsv,
  buildBulkMetafieldEditRollbackCsv,
  buildBulkMetafieldEditSummary,
  BulkMetafieldEditRuleError,
  coerceBulkMetafieldEditRows,
  computeProductMetafieldChange,
  formatMetafieldFieldKey,
  normalizeMetafieldValue,
  parseBulkMetafieldEditRule,
  parseMetafieldFieldKey,
  renderMetafieldTemplate,
  resolveBulkMetafieldEditPlan,
  templateHasPlaceholder,
  type BulkMetafieldEditDefinition,
  type BulkMetafieldEditProductInput,
  type BulkMetafieldEditRow,
} from "../../../app/lib/bulkMetafieldEdit";

const TEXT_DEFINITION: BulkMetafieldEditDefinition = {
  definitionId: "gid://shopify/MetafieldDefinition/1",
  name: "材质",
  namespace: "custom",
  key: "material",
  type: "single_line_text_field",
  description: null,
};

function definition(
  overrides: Partial<BulkMetafieldEditDefinition> = {},
): BulkMetafieldEditDefinition {
  return { ...TEXT_DEFINITION, ...overrides };
}

function product(
  overrides: Partial<BulkMetafieldEditProductInput> = {},
): BulkMetafieldEditProductInput {
  return {
    productId: "gid://shopify/Product/1",
    productTitle: "纯棉 T 恤",
    vendor: "Acme",
    productType: "Shirt",
    currentValue: null,
    ...overrides,
  };
}

describe("parseMetafieldFieldKey", () => {
  it("按最后一个点切分，容忍 namespace 里带点", () => {
    expect(parseMetafieldFieldKey("custom.material")).toEqual({
      namespace: "custom",
      key: "material",
    });
    // key 不允许含点，所以从右边切才不会把带点的 namespace 拆坏
    expect(parseMetafieldFieldKey("app--123.sub.material")).toEqual({
      namespace: "app--123.sub",
      key: "material",
    });
    expect(parseMetafieldFieldKey("nodot")).toBeNull();
    expect(parseMetafieldFieldKey(".leading")).toBeNull();
    expect(parseMetafieldFieldKey("trailing.")).toBeNull();
  });

  it("formatMetafieldFieldKey 与解析互为逆操作", () => {
    expect(formatMetafieldFieldKey("custom", "material")).toBe("custom.material");
  });
});

describe("normalizeMetafieldValue", () => {
  it("单行文本拒绝换行，多行文本放行", () => {
    expect(normalizeMetafieldValue("single_line_text_field", " 纯棉 ")).toBe("纯棉");
    expect(normalizeMetafieldValue("single_line_text_field", "第一行\n第二行")).toBeNull();
    expect(normalizeMetafieldValue("multi_line_text_field", "第一行\n第二行")).toBe(
      "第一行\n第二行",
    );
  });

  it("整数不做四舍五入：小数一律判非法", () => {
    expect(normalizeMetafieldValue("number_integer", "42")).toBe("42");
    expect(normalizeMetafieldValue("number_integer", "-7")).toBe("-7");
    expect(normalizeMetafieldValue("number_integer", "007")).toBe("7");
    // 进位方向是商户的决定，不是我们的
    expect(normalizeMetafieldValue("number_integer", "3.5")).toBeNull();
    expect(normalizeMetafieldValue("number_integer", "abc")).toBeNull();
  });

  it("小数接受整数与小数，拒绝千分位与非数字", () => {
    expect(normalizeMetafieldValue("number_decimal", "3.14")).toBe("3.14");
    expect(normalizeMetafieldValue("number_decimal", "10")).toBe("10");
    expect(normalizeMetafieldValue("number_decimal", "1,000")).toBeNull();
  });

  it("布尔值收敛常见写法，其余判非法", () => {
    for (const input of ["true", "TRUE", "1", "yes", "是"]) {
      expect(normalizeMetafieldValue("boolean", input)).toBe("true");
    }
    for (const input of ["false", "0", "no", "否"]) {
      expect(normalizeMetafieldValue("boolean", input)).toBe("false");
    }
    expect(normalizeMetafieldValue("boolean", "maybe")).toBeNull();
  });

  it("网址只放行 http(s)", () => {
    expect(normalizeMetafieldValue("url", "https://example.com/a")).toBe(
      "https://example.com/a",
    );
    expect(normalizeMetafieldValue("url", "example.com")).toBeNull();
    expect(normalizeMetafieldValue("url", "mailto:a@b.com")).toBeNull();
    expect(normalizeMetafieldValue("url", "javascript:alert(1)")).toBeNull();
  });

  it("空白值一律判非法，不写空串", () => {
    expect(normalizeMetafieldValue("single_line_text_field", "   ")).toBeNull();
  });
});

describe("renderMetafieldTemplate", () => {
  it("替换占位符但不做分隔符清理", () => {
    expect(
      renderMetafieldTemplate("{vendor} - {title}", {
        productTitle: "T 恤",
        vendor: "Acme",
        productType: null,
      }),
    ).toBe("Acme - T 恤");
    // metafield 存的是结构化数据，孤立的分隔符也照原样保留，不像 SEO 那样收拾
    expect(
      renderMetafieldTemplate("{vendor} - {title}", {
        productTitle: "T 恤",
        vendor: null,
        productType: null,
      }),
    ).toBe(" - T 恤");
  });

  it("templateHasPlaceholder 可重复调用（全局正则的 lastIndex 已归零）", () => {
    expect(templateHasPlaceholder("{title}")).toBe(true);
    expect(templateHasPlaceholder("{title}")).toBe(true);
    expect(templateHasPlaceholder("纯棉")).toBe(false);
  });
});

describe("parseBulkMetafieldEditRule", () => {
  it("解析设值规则", () => {
    expect(
      parseBulkMetafieldEditRule({
        metafieldAction: "set",
        fieldKey: "custom.material",
        value: "纯棉",
        onlyFillEmpty: "true",
      }),
    ).toEqual({
      action: "set",
      namespace: "custom",
      key: "material",
      valueTemplate: "纯棉",
      onlyFillEmpty: true,
    });
  });

  it("清空规则忽略值与写入范围", () => {
    expect(
      parseBulkMetafieldEditRule({
        metafieldAction: "clear",
        fieldKey: "custom.material",
        value: "被忽略",
        onlyFillEmpty: "true",
      }),
    ).toEqual({
      action: "clear",
      namespace: "custom",
      key: "material",
      valueTemplate: null,
      onlyFillEmpty: false,
    });
  });

  it("动作没选就报错，不默认成设值或清空", () => {
    expect(() =>
      parseBulkMetafieldEditRule({ metafieldAction: "unset", fieldKey: "custom.material" }),
    ).toThrow(BulkMetafieldEditRuleError);
    expect(() => parseBulkMetafieldEditRule({ fieldKey: "custom.material" })).toThrow(
      /设置为指定值/,
    );
  });

  it("字段缺失或格式非法时报错", () => {
    expect(() => parseBulkMetafieldEditRule({ metafieldAction: "set", value: "x" })).toThrow(
      /选择要修改的自定义字段/,
    );
    expect(() =>
      parseBulkMetafieldEditRule({ metafieldAction: "set", fieldKey: "nodot", value: "x" }),
    ).toThrow(/字段标识无效/);
  });

  it("设值时值必填，且未知占位符直接报错", () => {
    expect(() =>
      parseBulkMetafieldEditRule({
        metafieldAction: "set",
        fieldKey: "custom.material",
        value: "   ",
      }),
    ).toThrow(/请填写要写入的值/);
    expect(() =>
      parseBulkMetafieldEditRule({
        metafieldAction: "set",
        fieldKey: "custom.material",
        value: "{sku}",
      }),
    ).toThrow(/不是可用占位符/);
  });
});

describe("resolveBulkMetafieldEditPlan", () => {
  it("字面值合法时预先规范化，逐行不用再算", () => {
    const plan = resolveBulkMetafieldEditPlan(
      {
        action: "set",
        namespace: "custom",
        key: "weight",
        valueTemplate: " 007 ",
        onlyFillEmpty: false,
      },
      definition({ type: "number_integer", key: "weight", name: "重量" }),
    );
    expect(plan.staticValue).toBe("7");
    expect(plan.type).toBe("number_integer");
  });

  it("含占位符时不预渲染，留给逐行计算", () => {
    const plan = resolveBulkMetafieldEditPlan(
      {
        action: "set",
        namespace: "custom",
        key: "material",
        valueTemplate: "{vendor} 出品",
        onlyFillEmpty: false,
      },
      definition(),
    );
    expect(plan.staticValue).toBeNull();
    expect(plan.valueTemplate).toBe("{vendor} 出品");
  });

  it("字面值不合类型时整任务失败，而不是逐行标跳过", () => {
    expect(() =>
      resolveBulkMetafieldEditPlan(
        {
          action: "set",
          namespace: "custom",
          key: "weight",
          valueTemplate: "abc",
          onlyFillEmpty: false,
        },
        definition({ type: "number_integer" }),
      ),
    ).toThrow(/不是合法的整数/);
  });

  it("不支持的类型直接拒绝", () => {
    expect(() =>
      resolveBulkMetafieldEditPlan(
        {
          action: "set",
          namespace: "custom",
          key: "tags",
          valueTemplate: "x",
          onlyFillEmpty: false,
        },
        definition({ type: "list.single_line_text_field" }),
      ),
    ).toThrow(/暂不支持批量修改这种类型/);
  });
});

describe("computeProductMetafieldChange", () => {
  const setPlan = (overrides: Partial<Parameters<typeof computeProductMetafieldChange>[1]> = {}) =>
    ({
      action: "set" as const,
      name: "材质",
      namespace: "custom",
      key: "material",
      type: "single_line_text_field" as const,
      valueTemplate: "纯棉",
      onlyFillEmpty: false,
      staticValue: "纯棉",
      ...overrides,
    }) satisfies Parameters<typeof computeProductMetafieldChange>[1];

  it("空字段写入新值", () => {
    const row = computeProductMetafieldChange(product(), setPlan());
    expect(row).toMatchObject({ skipped: false, beforeValue: null, afterValue: "纯棉" });
  });

  it("值相同时跳过", () => {
    const row = computeProductMetafieldChange(product({ currentValue: "纯棉" }), setPlan());
    expect(row).toMatchObject({ skipped: true, skipReason: "no_change" });
  });

  it("只填空缺时不覆盖已有值", () => {
    const row = computeProductMetafieldChange(
      product({ currentValue: "涤纶" }),
      setPlan({ onlyFillEmpty: true }),
    );
    expect(row).toMatchObject({ skipped: true, skipReason: "already_filled" });
  });

  it("占位符全空时不写空串", () => {
    const row = computeProductMetafieldChange(
      product({ vendor: null }),
      setPlan({ valueTemplate: "{vendor}", staticValue: null }),
    );
    expect(row).toMatchObject({ skipped: true, skipReason: "empty_result" });
  });

  it("模板渲染结果不合类型时逐行标注，并保留渲染值方便排查", () => {
    const row = computeProductMetafieldChange(
      product({ productTitle: "T 恤" }),
      setPlan({
        type: "number_integer",
        valueTemplate: "{title}",
        staticValue: null,
      }),
    );
    expect(row).toMatchObject({
      skipped: true,
      skipReason: "invalid_value",
      invalidValue: "T 恤",
    });
  });

  it("清空：有值才写，没值标 nothing_to_clear", () => {
    const clearPlan = setPlan({ action: "clear", valueTemplate: null, staticValue: null });
    expect(computeProductMetafieldChange(product({ currentValue: "纯棉" }), clearPlan)).toMatchObject(
      { skipped: false, beforeValue: "纯棉", afterValue: null },
    );
    expect(computeProductMetafieldChange(product(), clearPlan)).toMatchObject({
      skipped: true,
      skipReason: "nothing_to_clear",
    });
  });
});

describe("buildBulkMetafieldEditSummary", () => {
  const rows: BulkMetafieldEditRow[] = [
    { productId: "1", productTitle: "A", beforeValue: null, afterValue: "x", skipped: false },
    {
      productId: "2",
      productTitle: "B",
      beforeValue: null,
      afterValue: null,
      skipped: true,
      skipReason: "invalid_value",
    },
    {
      productId: "3",
      productTitle: "C",
      beforeValue: "x",
      afterValue: null,
      skipped: true,
      skipReason: "no_change",
    },
  ];

  it("按动作把变更数记到 setCount 或 clearCount", () => {
    expect(buildBulkMetafieldEditSummary(rows, "set")).toEqual({
      products: 3,
      changed: 1,
      skipped: 2,
      setCount: 1,
      clearCount: 0,
      invalidCount: 1,
    });
    expect(buildBulkMetafieldEditSummary(rows, "clear")).toMatchObject({
      setCount: 0,
      clearCount: 1,
    });
  });
});

describe("coerceBulkMetafieldEditRows", () => {
  it("丢弃没有 productId 的行，未知 skipReason 不带进结果", () => {
    const rows = coerceBulkMetafieldEditRows([
      { productId: "", productTitle: "无 id" },
      { productId: "1", productTitle: "A", afterValue: "x", skipped: false },
      { productId: "2", productTitle: "B", skipped: true, skipReason: "made_up" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[1].skipReason).toBeUndefined();
  });

  it("非数组输入返回空数组", () => {
    expect(coerceBulkMetafieldEditRows(null)).toEqual([]);
    expect(coerceBulkMetafieldEditRows("rows")).toEqual([]);
  });
});

describe("CSV", () => {
  const field = { namespace: "custom", key: "material", type: "single_line_text_field" };
  const rows: BulkMetafieldEditRow[] = [
    {
      productId: "gid://shopify/Product/1",
      productTitle: "A",
      beforeValue: null,
      afterValue: "纯棉",
      skipped: false,
    },
    {
      productId: "gid://shopify/Product/2",
      productTitle: "B",
      beforeValue: "涤纶",
      afterValue: "纯棉",
      skipped: false,
    },
    {
      productId: "gid://shopify/Product/3",
      productTitle: "C",
      beforeValue: "纯棉",
      afterValue: null,
      skipped: true,
      skipReason: "no_change",
    },
  ];

  it("变更清单包含跳过行与原因", () => {
    const csv = buildBulkMetafieldEditChangesetCsv(rows, field, "set");
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("before_value,after_value,action,reason");
    expect(lines).toHaveLength(4);
    expect(lines[3]).toContain("skip");
    expect(lines[3]).toContain("no_change");
  });

  it("回滚清单只列会写入的行，并区分「恢复原值」与「删除字段」", () => {
    const csv = buildBulkMetafieldEditRollbackCsv(rows, field);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(3);
    // 原本没有这个字段的商品，回滚要删掉它而不是写空串
    expect(lines[1]).toContain("delete");
    expect(lines[2]).toContain("set");
    expect(lines[2]).toContain("涤纶");
  });
});
