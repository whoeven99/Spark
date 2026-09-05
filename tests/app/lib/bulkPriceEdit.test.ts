import { describe, expect, it } from "vitest";
import {
  BULK_PRICE_EDIT_MAX_PERCENT_DOWN,
  BulkPriceEditRuleError,
  buildBulkPriceEditChangesetCsv,
  buildBulkPriceEditRollbackCsv,
  buildBulkPriceEditSummary,
  coerceBulkPriceEditRows,
  computeVariantPriceChange,
  parseBulkPriceEditRule,
  type BulkPriceEditRule,
  type BulkPriceEditVariantInput,
} from "../../../app/lib/bulkPriceEdit";

const rule = (overrides: Partial<BulkPriceEditRule> = {}): BulkPriceEditRule => ({
  priceMode: "percent_down",
  priceValue: 10,
  rounding: "none",
  compareAtMode: "unchanged",
  minPrice: null,
  ...overrides,
});

const variant = (
  overrides: Partial<BulkPriceEditVariantInput> = {},
): BulkPriceEditVariantInput => ({
  variantId: "gid://shopify/ProductVariant/1",
  productId: "gid://shopify/Product/1",
  productTitle: "Mug",
  variantTitle: "Default",
  sku: "MUG-1",
  price: "20.00",
  compareAtPrice: null,
  ...overrides,
});

describe("computeVariantPriceChange", () => {
  it("applies percentage discounts on integer cents", () => {
    const row = computeVariantPriceChange(variant({ price: "19.99" }), rule({ priceValue: 15 }));
    expect(row.afterPrice).toBe("16.99");
    expect(row.priceChanged).toBe(true);
    expect(row.skipped).toBe(false);
  });

  it("applies fixed amount increases", () => {
    const row = computeVariantPriceChange(
      variant({ price: "20.00" }),
      rule({ priceMode: "amount_up", priceValue: 5.5 }),
    );
    expect(row.afterPrice).toBe("25.50");
  });

  it("sets a fixed price for every variant", () => {
    const row = computeVariantPriceChange(
      variant({ price: "20.00" }),
      rule({ priceMode: "set_fixed", priceValue: 9.9 }),
    );
    expect(row.afterPrice).toBe("9.90");
  });

  it("rounds to the nearest .99 / .95 / integer", () => {
    const base = variant({ price: "20.00" });
    expect(
      computeVariantPriceChange(base, rule({ priceValue: 10, rounding: "end99" })).afterPrice,
    ).toBe("17.99");
    expect(
      computeVariantPriceChange(base, rule({ priceValue: 10, rounding: "end95" })).afterPrice,
    ).toBe("17.95");
    expect(
      computeVariantPriceChange(base, rule({ priceValue: 12, rounding: "integer" })).afterPrice,
    ).toBe("18.00");
  });

  it("never rounds below zero", () => {
    const row = computeVariantPriceChange(
      variant({ price: "0.50" }),
      rule({ priceValue: 50, rounding: "end99" }),
    );
    expect(Number(row.afterPrice)).toBeGreaterThan(0);
  });

  it("skips variants that fall below the minimum price guard", () => {
    const row = computeVariantPriceChange(
      variant({ price: "10.00" }),
      rule({ priceValue: 50, minPrice: 8 }),
    );
    expect(row.skipped).toBe(true);
    expect(row.skipReason).toBe("below_min_price");
    expect(row.priceChanged).toBe(false);
  });

  it("skips variants without a usable current price", () => {
    const row = computeVariantPriceChange(variant({ price: null }), rule());
    expect(row.skipReason).toBe("missing_price");
  });

  it("skips no-op rows", () => {
    const row = computeVariantPriceChange(
      variant({ price: "20.00" }),
      rule({ priceMode: "unchanged", compareAtMode: "original_price" }),
    );
    expect(row.skipped).toBe(true);
    expect(row.skipReason).toBe("no_change");
  });

  it("writes the pre-discount price into compareAtPrice", () => {
    const row = computeVariantPriceChange(
      variant({ price: "20.00" }),
      rule({ priceValue: 25, compareAtMode: "original_price" }),
    );
    expect(row.afterPrice).toBe("15.00");
    expect(row.afterCompareAt).toBe("20.00");
    expect(row.compareAtChanged).toBe(true);
  });

  it("leaves compareAtPrice alone when it would not exceed the new price", () => {
    const row = computeVariantPriceChange(
      variant({ price: "20.00" }),
      rule({ priceMode: "amount_up", priceValue: 5, compareAtMode: "original_price" }),
    );
    expect(row.compareAtChanged).toBe(false);
    expect(row.note).toBe("compare_at_not_greater");
  });

  it("clears compareAtPrice only when one exists", () => {
    const cleared = computeVariantPriceChange(
      variant({ price: "20.00", compareAtPrice: "30.00" }),
      rule({ priceMode: "unchanged", compareAtMode: "clear" }),
    );
    expect(cleared.compareAtChanged).toBe(true);
    expect(cleared.afterCompareAt).toBeNull();

    const noop = computeVariantPriceChange(
      variant({ price: "20.00", compareAtPrice: null }),
      rule({ priceMode: "unchanged", compareAtMode: "clear" }),
    );
    expect(noop.skipped).toBe(true);
  });
});

describe("parseBulkPriceEditRule", () => {
  it("parses percentage rules from string params", () => {
    const parsed = parseBulkPriceEditRule({
      priceMode: "percent_up",
      priceValue: "12%",
      rounding: "end99",
      compareAtMode: "clear",
      minPrice: "5",
    });
    expect(parsed).toEqual({
      priceMode: "percent_up",
      priceValue: 12,
      rounding: "end99",
      compareAtMode: "clear",
      minPrice: 5,
    });
  });

  it("rejects missing or non-positive values", () => {
    expect(() => parseBulkPriceEditRule({ priceMode: "percent_down", priceValue: "" })).toThrow(
      BulkPriceEditRuleError,
    );
    expect(() => parseBulkPriceEditRule({ priceMode: "percent_down", priceValue: "0" })).toThrow(
      BulkPriceEditRuleError,
    );
  });

  it("rejects implausible discounts", () => {
    expect(() =>
      parseBulkPriceEditRule({
        priceMode: "percent_down",
        priceValue: String(BULK_PRICE_EDIT_MAX_PERCENT_DOWN + 1),
      }),
    ).toThrow(BulkPriceEditRuleError);
  });

  it("rejects rules that change nothing", () => {
    expect(() =>
      parseBulkPriceEditRule({ priceMode: "unchanged", compareAtMode: "unchanged" }),
    ).toThrow(BulkPriceEditRuleError);
  });
});

describe("summary and CSV", () => {
  const rows = [
    computeVariantPriceChange(variant({ variantId: "v1" }), rule()),
    computeVariantPriceChange(
      variant({ variantId: "v2", productId: "gid://shopify/Product/2", price: null }),
      rule(),
    ),
  ];

  it("counts distinct products, changes and skips", () => {
    expect(buildBulkPriceEditSummary(rows)).toEqual({
      products: 2,
      variants: 2,
      changed: 1,
      skipped: 1,
    });
  });

  it("emits skipped rows with a reason and no target price", () => {
    const csv = buildBulkPriceEditChangesetCsv(rows);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("before_price");
    expect(lines[2]).toContain("skip");
    expect(lines[2]).toContain("missing_price");
  });

  it("escapes separators and quotes in titles", () => {
    const csv = buildBulkPriceEditChangesetCsv([
      computeVariantPriceChange(variant({ productTitle: 'Mug, 12" "big"' }), rule()),
    ]);
    expect(csv).toContain('"Mug, 12"" ""big"""');
  });

  it("keeps only writable rows with original values in the rollback CSV", () => {
    const csv = buildBulkPriceEditRollbackCsv(rows);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("20.00");
  });
});

describe("coerceBulkPriceEditRows", () => {
  it("drops rows that claim a price change without a valid amount", () => {
    const rows = coerceBulkPriceEditRows([
      { variantId: "v1", productId: "p1", priceChanged: true, afterPrice: "not-a-price" },
      { variantId: "v2", productId: "p1", priceChanged: true, afterPrice: "12.00" },
      { variantId: "", productId: "p1", priceChanged: true, afterPrice: "12.00" },
    ]);
    expect(rows.map((row) => row.variantId)).toEqual(["v2"]);
  });

  it("returns an empty list for non-array input", () => {
    expect(coerceBulkPriceEditRows(null)).toEqual([]);
    expect(coerceBulkPriceEditRows({ rows: [] })).toEqual([]);
  });
});
