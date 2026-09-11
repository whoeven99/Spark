import { describe, expect, it } from "vitest";
import {
  analyzeImportSheet,
  mapImportHeaders,
  parseImportStatus,
} from "../../../app/lib/productImport";
import {
  buildProductImportPlan,
  matchImportRecord,
  type ProductImportProductSnapshot,
} from "../../../app/lib/productImportPlan";

const product = (overrides: Partial<ProductImportProductSnapshot> = {}): ProductImportProductSnapshot => ({
  productId: "gid://shopify/Product/1",
  productTitle: "Tee",
  handle: "tee",
  vendor: "Old",
  productType: "Apparel",
  seoTitle: "Old title",
  seoDescription: "Old desc",
  tags: ["a"],
  status: "ACTIVE",
  totalInventory: 3,
  tracksInventory: true,
  publishedAt: "2026-01-01",
  variants: [
    {
      variantId: "gid://shopify/ProductVariant/1",
      title: "Default",
      sku: "TEE-1",
      price: "10.00",
      compareAtPrice: null,
    },
  ],
  ...overrides,
});

describe("mapImportHeaders", () => {
  it("maps Shopify CSV headers and flags v1-unsupported columns", () => {
    const mapped = mapImportHeaders([
      "Handle",
      "Title",
      "Vendor",
      "Type",
      "Tags",
      "Variant SKU",
      "Variant Price",
      "SEO Title",
      "Status",
      "Cost per item",
    ]);
    expect(mapped.columns.handle).toBe("Handle");
    expect(mapped.columns.sku).toBe("Variant SKU");
    expect(mapped.columns.price).toBe("Variant Price");
    expect(mapped.columns.vendor).toBe("Vendor");
    expect(mapped.unsupported.map((item) => item.code)).toEqual(
      expect.arrayContaining(["create_fields_not_in_v1", "cost_not_in_v1"]),
    );
  });

  it("keeps unrecognized headers as unknown", () => {
    const mapped = mapImportHeaders(["Handle", "Custom Note"]);
    expect(mapped.unknown).toEqual(["Custom Note"]);
  });
});

describe("analyzeImportSheet", () => {
  it("forward-fills Handle like Shopify CSV and reports identity / SEO problems", () => {
    const analysis = analyzeImportSheet(
      ["Handle", "Vendor", "SEO Title", "Variant SKU", "Variant Price"],
      [
        ["tee", "Acme", "短".repeat(40), "TEE-1", "12.00"],
        ["", "Acme", "ok", "TEE-2", "bad"],
        ["", "", "", "", ""],
      ],
    );
    expect(analysis.operations).toEqual(expect.arrayContaining(["vendor", "seoTitle", "price"]));
    expect(analysis.records).toHaveLength(2);
    expect(analysis.records[1]?.handle).toBe("tee");
    expect(analysis.issues.some((issue) => issue.code === "too_long_seo_title")).toBe(true);
    expect(analysis.issues.some((issue) => issue.code === "invalid_price" && issue.rowNumber === 3)).toBe(
      true,
    );
  });

  it("fails the sheet when there is no identity column and no supported mutation columns", () => {
    const analysis = analyzeImportSheet(["Title", "Cost"], [["Hat", "3"]]);
    expect(analysis.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["missing_identity", "no_supported_columns", "cost_not_in_v1"]),
    );
  });

  it("reports unknown columns so merchants know to remove them", () => {
    const analysis = analyzeImportSheet(
      ["Handle", "Vendor", "Custom Note"],
      [["tee", "Acme", "ignore-me"]],
    );
    expect(analysis.issues.some((issue) => issue.code === "unsupported_column" && issue.column === "Custom Note")).toBe(
      true,
    );
  });
});

describe("parseImportStatus", () => {
  it("accepts Shopify CSV status values", () => {
    expect(parseImportStatus("active")).toBe("ACTIVE");
    expect(parseImportStatus("DRAFT")).toBe("DRAFT");
    expect(parseImportStatus("archived")).toBe("ARCHIVED");
    expect(parseImportStatus("nope")).toBeNull();
  });
});

describe("buildProductImportPlan", () => {
  it("builds vendor and price changes for a matched SKU", () => {
    const snapshot = product();
    const analysis = analyzeImportSheet(
      ["Handle", "Vendor", "Variant SKU", "Variant Price"],
      [["tee", "NewCo", "TEE-1", "12.50"]],
    );
    const catalog = {
      byHandle: new Map([["tee", snapshot]]),
      byId: new Map([[snapshot.productId, snapshot]]),
      bySku: new Map([["tee-1", [snapshot]]]),
    };
    const matches = analysis.records.map((record) => matchImportRecord(record, catalog));
    const plan = buildProductImportPlan({
      matches,
      sheetIssues: analysis.issues,
      operations: analysis.operations,
      collections: [],
    });
    expect(plan.priceRows[0]?.afterPrice).toBe("12.50");
    expect(plan.priceRows[0]?.skipped).toBe(false);
    expect(plan.fieldRows[0]?.afterValue).toBe("NewCo");
  });

  it("reports missing SKU and does not write that row", () => {
    const snapshot = product();
    const analysis = analyzeImportSheet(["Handle", "Vendor"], [["missing", "NewCo"]]);
    const catalog = {
      byHandle: new Map([["tee", snapshot]]),
      byId: new Map([[snapshot.productId, snapshot]]),
      bySku: new Map(),
    };
    const matches = analysis.records.map((record) => matchImportRecord(record, catalog));
    const plan = buildProductImportPlan({
      matches,
      sheetIssues: analysis.issues,
      operations: analysis.operations,
      collections: [],
    });
    expect(plan.issues.some((issue) => issue.code === "handle_not_found")).toBe(true);
    expect(plan.fieldRows).toHaveLength(0);
  });
});
