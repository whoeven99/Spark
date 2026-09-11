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
  descriptionHtml: "<p>old</p>",
  vendor: "Old",
  productType: "Apparel",
  seoTitle: "Old title",
  seoDescription: "Old desc",
  tags: ["a"],
  status: "ACTIVE",
  totalInventory: 3,
  tracksInventory: true,
  publishedAt: "2026-01-01",
  metafields: [],
  variants: [
    {
      variantId: "gid://shopify/ProductVariant/1",
      title: "Default",
      sku: "TEE-1",
      price: "10.00",
      compareAtPrice: null,
      inventoryItemId: "gid://shopify/InventoryItem/1",
      cost: "4.00",
      metafields: [],
    },
  ],
  ...overrides,
});

describe("mapImportHeaders", () => {
  it("maps Shopify CSV headers and flags still-unsupported create columns", () => {
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
      "Option1 Name",
    ]);
    expect(mapped.columns.handle).toBe("Handle");
    expect(mapped.columns.title).toBe("Title");
    expect(mapped.columns.sku).toBe("Variant SKU");
    expect(mapped.columns.price).toBe("Variant Price");
    expect(mapped.columns.vendor).toBe("Vendor");
    expect(mapped.columns.cost).toBe("Cost per item");
    expect(mapped.unsupported.map((item) => item.code)).toEqual(["create_fields_not_in_v1"]);
  });

  it("parses metafield headers", () => {
    const mapped = mapImportHeaders([
      "Handle",
      "Metafield: custom.fabric [single_line_text_field]",
    ]);
    expect(mapped.metafields).toEqual([
      expect.objectContaining({
        owner: "product",
        namespace: "custom",
        key: "fabric",
        type: "single_line_text_field",
      }),
    ]);
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

  it("requires identity even when Title and Cost are present", () => {
    const analysis = analyzeImportSheet(["Title", "Cost"], [["Hat", "3"]]);
    expect(analysis.operations).toEqual(expect.arrayContaining(["title", "cost"]));
    expect(analysis.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["missing_identity"]));
    expect(analysis.issues.some((issue) => issue.code === "no_supported_columns")).toBe(false);
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

  it("plans title, cost, handle and skips other ops when delete is true", () => {
    const snapshot = product();
    const analysis = analyzeImportSheet(
      ["Handle", "Title", "Cost per item", "New Handle", "Delete", "Vendor"],
      [["tee", "New Tee", "5.00", "new-tee", "true", "Nike"]],
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
    expect(plan.deleteRows).toHaveLength(1);
    expect(plan.deleteRows[0]?.skipped).toBe(false);
    expect(plan.fieldRows).toHaveLength(0);
    expect(plan.costRows).toHaveLength(0);
    expect(plan.handleRows).toHaveLength(0);
  });

  it("plans cost and title when the row is not a delete", () => {
    const snapshot = product();
    const analysis = analyzeImportSheet(
      ["Handle", "Title", "Variant SKU", "Cost per item"],
      [["tee", "New Tee", "TEE-1", "5.50"]],
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
    expect(plan.fieldRows.find((row) => row.field === "title")?.afterValue).toBe("New Tee");
    expect(plan.costRows[0]?.afterCost).toBe("5.50");
    expect(plan.costRows[0]?.skipped).toBe(false);
  });

  it("plans a defined scalar metafield and skips blank cells", () => {
    const snapshot = product({
      metafields: [{ namespace: "custom", key: "fabric", type: "single_line_text_field", value: "cotton" }],
    });
    const analysis = analyzeImportSheet(
      ["Handle", "Metafield: custom.fabric [single_line_text_field]"],
      [
        ["tee", "linen"],
        ["tee", ""],
      ],
    );
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
      metafields: analysis.mapping.metafields,
      definitions: new Map([
        [
          "product:custom.fabric",
          { owner: "product", namespace: "custom", key: "fabric", type: "single_line_text_field" },
        ],
      ]),
    });
    expect(plan.metafieldRows).toHaveLength(1);
    expect(plan.metafieldRows[0]?.afterValue).toBe("linen");
    expect(plan.metafieldRows[0]?.action).toBe("set");
    expect(plan.issues.some((issue) => issue.code === "metafield_definition_missing")).toBe(false);
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
