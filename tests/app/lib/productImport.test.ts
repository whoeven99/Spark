import { describe, expect, it } from "vitest";
import {
  analyzeImportSheet,
  coerceProductImportOperations,
  collapseRepeatedImportIssues,
  filterActionableImportIssues,
  mapImportHeaders,
  normalizeImportSku,
  parseImportStatus,
  stripExcelTextPrefix,
  suggestImportOperations,
} from "../../../app/lib/productImport";
import { SHOPIFY_CSV_HEADERS } from "../../../app/lib/productExport";
import { buildProductImportProposal } from "../../../app/lib/productManageTaskProposals";
import {
  buildProductImportPlan,
  chunkImportPlanByProduct,
  matchImportRecord,
  matchImportRecords,
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
      barcode: null,
      price: "10.00",
      compareAtPrice: null,
      inventoryItemId: "gid://shopify/InventoryItem/1",
      cost: "4.00",
      weightValue: null,
      weightUnit: null,
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
      "Published",
    ]);
    expect(mapped.columns.handle).toBe("Handle");
    expect(mapped.columns.title).toBe("Title");
    expect(mapped.columns.sku).toBe("Variant SKU");
    expect(mapped.columns.price).toBe("Variant Price");
    expect(mapped.columns.vendor).toBe("Vendor");
    expect(mapped.columns.cost).toBe("Cost per item");
    expect(mapped.unsupported.map((item) => item.code)).toEqual(["create_fields_not_in_v1"]);
  });

  it("uses Option values for matching and ignores Option names", () => {
    const mapped = mapImportHeaders([
      "Handle",
      "Option1 Name",
      "Option1 Value",
      "Option2 Name",
      "Option2 Value",
      "Option3 Value",
    ]);
    expect(mapped.columns.option1).toBe("Option1 Value");
    expect(mapped.columns.option2).toBe("Option2 Value");
    expect(mapped.columns.option3).toBe("Option3 Value");
    expect(mapped.ignored).toEqual(["Option1 Name", "Option2 Name"]);
    expect(mapped.unsupported).toEqual([]);
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

  it("parses Shopify Admin native metafield headers and ignores channel extras", () => {
    const mapped = mapImportHeaders([
      "Handle",
      "New Handle",
      "Collection",
      "Variant Barcodes",
      "Unit Price Total Measure",
      "Unit Price Base Measure Unit",
      "Google Shopping / Gender",
      "Google Shopping / Custom Label 0",
      "汉字无法报错测试 (product.metafields.custom.chineseword)",
      "Custom Description (product.metafields.custom.custom_description)",
      "Color (product.metafields.shopify.color-pattern)",
      "元字段使用方法测试 (product.metafields.custom._test)",
      "Google: Custom Product (product.metafields.mm-google-shopping.custom_product)",
      "Size (variant.metafields.custom.size)",
    ]);
    expect(mapped.columns.handle).toBe("Handle");
    expect(mapped.columns.new_handle).toBe("New Handle");
    expect(mapped.columns.collection).toBe("Collection");
    expect(mapped.columns.barcode).toBe("Variant Barcodes");
    expect(mapped.unknown).toEqual([]);
    expect(mapped.ignored).toEqual(
      expect.arrayContaining([
        "Unit Price Total Measure",
        "Unit Price Base Measure Unit",
        "Google Shopping / Gender",
        "Google Shopping / Custom Label 0",
      ]),
    );
    expect(mapped.unsupported).toEqual([]);
    expect(mapped.metafields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: "product",
          namespace: "custom",
          key: "chineseword",
        }),
        expect.objectContaining({
          owner: "product",
          namespace: "custom",
          key: "custom_description",
        }),
        expect.objectContaining({
          owner: "product",
          namespace: "shopify",
          key: "color-pattern",
        }),
        expect.objectContaining({ owner: "product", namespace: "custom", key: "_test" }),
        expect.objectContaining({
          owner: "product",
          namespace: "mm-google-shopping",
          key: "custom_product",
        }),
        expect.objectContaining({ owner: "variant", namespace: "custom", key: "size" }),
      ]),
    );
  });

  it("keeps unrecognized headers as unknown", () => {
    const mapped = mapImportHeaders(["Handle", "Custom Note"]);
    expect(mapped.unknown).toEqual(["Custom Note"]);
  });

  it("classifies native Shopify export columns as writable, unsupported, or ignored", () => {
    const mapped = mapImportHeaders([...SHOPIFY_CSV_HEADERS]);
    expect(mapped.columns.handle).toBe("Handle");
    expect(mapped.columns.price).toBe("Variant Price");
    expect(mapped.columns.compare_at).toBe("Variant Compare At Price");
    expect(mapped.columns.status).toBe("Status");
    expect(mapped.unknown).toEqual([]);
    expect(mapped.ignored).toEqual(
      expect.arrayContaining(["Product Category", "Gift Card", "Option1 Name"]),
    );
    expect(mapped.columns.option1).toBe("Option1 Value");
    expect(mapped.columns.option2).toBe("Option2 Value");
    expect(mapped.columns.option3).toBe("Option3 Value");
    expect(mapped.columns.barcode).toBe("Variant Barcode");
    expect(mapped.columns.grams).toBe("Variant Grams");
    expect(mapped.unsupported).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ header: "Published", code: "create_fields_not_in_v1" }),
        expect.objectContaining({ header: "Variant Inventory Qty", code: "inventory_not_in_v1" }),
        expect.objectContaining({ header: "Image Src", code: "create_fields_not_in_v1" }),
      ]),
    );
    expect(mapped.unsupported.some((item) => item.header.startsWith("Option"))).toBe(false);
  });
});

describe("analyzeImportSheet", () => {
  it("forward-fills Handle like Shopify CSV and reports identity / SEO problems", () => {
    const analysis = analyzeImportSheet(
      ["Handle", "Vendor", "SEO Title", "Variant SKU", "Variant Price"],
      [
        ["tee", "Acme", "短".repeat(71), "TEE-1", "12.00"],
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

  it("only plans selected operations and ignores other supported columns", () => {
    const analysis = analyzeImportSheet(
      ["Handle", "Vendor", "Variant SKU", "Variant Price"],
      [["tee", "Acme", "TEE-1", "12.50"]],
      ["price"],
    );
    expect(analysis.operations).toEqual(["price"]);
    expect(analysis.issues.some((issue) => issue.code === "column_not_selected" && issue.column === "Vendor")).toBe(
      true,
    );
    expect(analysis.issues.some((issue) => issue.code === "missing_column_for_operation")).toBe(false);
  });

  it("reports a missing column when the selected action is not in the file", () => {
    const analysis = analyzeImportSheet(["Handle", "Vendor"], [["tee", "Acme"]], ["seoTitle"]);
    expect(analysis.operations).toEqual([]);
    expect(
      analysis.issues.some(
        (issue) => issue.code === "missing_column_for_operation" && issue.value === "seoTitle",
      ),
    ).toBe(true);
  });

  it("defaults Duplicate=TRUE when copy is selected and the sheet has no such column", () => {
    const analysis = analyzeImportSheet(
      ["Handle", "Variant SKU"],
      [
        ["tee", "TEE-1"],
        ["hat", "HAT-1"],
      ],
      ["duplicate"],
    );
    expect(analysis.operations).toEqual(["duplicate"]);
    expect(analysis.mapping.columns.duplicate).toBe("Duplicate");
    expect(analysis.records.map((record) => record.cells.duplicate)).toEqual(["TRUE", "TRUE"]);
    expect(analysis.issues.some((issue) => issue.code === "missing_column_for_operation")).toBe(false);
  });

  it("keeps per-row Duplicate values when the column is already in the file", () => {
    const analysis = analyzeImportSheet(
      ["Handle", "Duplicate"],
      [
        ["tee", "TRUE"],
        ["hat", "FALSE"],
      ],
      ["duplicate"],
    );
    expect(analysis.records.map((record) => record.cells.duplicate)).toEqual(["TRUE", "FALSE"]);
  });

  it("defaults Archive and Delete to TRUE when those actions are selected without columns", () => {
    const analysis = analyzeImportSheet(
      ["Handle"],
      [["tee"]],
      ["duplicate", "archive", "delete"],
    );
    expect(analysis.operations).toEqual(["duplicate", "archive", "delete"]);
    expect(analysis.mapping.columns.archive).toBe("Archive");
    expect(analysis.mapping.columns.delete).toBe("Delete");
    expect(analysis.records[0]?.cells.archive).toBe("TRUE");
    expect(analysis.records[0]?.cells.delete).toBe("TRUE");
    expect(analysis.issues.some((issue) => issue.code === "missing_column_for_operation")).toBe(false);
  });

  it("does not treat an unspecified selection as column_not_selected", () => {
    const analysis = analyzeImportSheet(["Handle", "Vendor", "Title"], [["tee", "Acme", "Tee"]]);
    expect(analysis.operations).toEqual(["title", "vendor"]);
    expect(analysis.issues.some((issue) => issue.code === "column_not_selected")).toBe(false);
  });

  it("flags Shopify title and tag hard limits", () => {
    const analysis = analyzeImportSheet(
      ["Handle", "Title", "Tags"],
      [["tee", "A".repeat(256), `${"x".repeat(256)},ok`]],
      ["title", "tags"],
    );
    expect(analysis.issues.some((issue) => issue.code === "too_long_title")).toBe(true);
    expect(analysis.issues.some((issue) => issue.code === "tag_too_long")).toBe(true);
  });

  it("keeps Shopify hard-limit issues actionable and native unsupported columns informational", () => {
    const issues = filterActionableImportIssues([
      { rowNumber: 2, code: "too_long_title", column: "title" },
      { rowNumber: 0, code: "create_fields_not_in_v1", column: "Published" },
      { rowNumber: 0, code: "column_not_selected", column: "Vendor" },
      { rowNumber: 0, code: "unsupported_column", column: "Custom Note" },
    ]);
    expect(issues.map((issue) => issue.code)).toEqual(["too_long_title"]);
  });
});

describe("coerceProductImportOperations", () => {
  it("parses a comma-separated string in canonical order", () => {
    expect(coerceProductImportOperations("tags, price, tags")).toEqual(["price", "tags"]);
  });
});

describe("suggestImportOperations", () => {
  it("suggests detected columns except sku, duplicate, archive, and delete", () => {
    expect(suggestImportOperations(["title", "delete", "archive", "price", "duplicate", "sku"])).toEqual([
      "title",
      "price",
    ]);
  });
});

describe("buildProductImportProposal", () => {
  it("opens an empty card with no operations and a visible file field", () => {
    const proposal = buildProductImportProposal({});
    const operations = proposal.params.find((field) => field.key === "operations");
    const file = proposal.params.find((field) => field.key === "fileId");
    expect(operations?.type).toBe("multiselect");
    expect(operations?.value).toBe("");
    expect(file?.type).toBe("file");
    expect(file?.value).toBe("");
  });

  it("prefills operations when the tool already knows the intent", () => {
    const proposal = buildProductImportProposal({ operations: ["seoTitle", "price"] });
    expect(proposal.params.find((field) => field.key === "operations")?.value).toBe("price,seoTitle");
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
      columnKeys: Object.keys(analysis.mapping.columns),
      collections: [],
    });
    expect(plan.priceRows[0]?.afterPrice).toBe("12.50");
    expect(plan.priceRows[0]?.skipped).toBe(false);
    expect(plan.fieldRows[0]?.afterValue).toBe("NewCo");
  });

  it("calls only the price module when vendor was not selected", () => {
    const snapshot = product();
    const analysis = analyzeImportSheet(
      ["Handle", "Vendor", "Variant SKU", "Variant Price"],
      [["tee", "NewCo", "TEE-1", "12.50"]],
      ["price"],
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
      columnKeys: Object.keys(analysis.mapping.columns),
      collections: [],
    });
    expect(plan.operations).toEqual(["price"]);
    expect(plan.priceRows[0]?.afterPrice).toBe("12.50");
    expect(plan.fieldRows).toEqual([]);
  });

  it("plans a duplicate for every matched product when copy is selected without a Duplicate column", () => {
    const snapshot = product();
    const analysis = analyzeImportSheet(["Handle", "Variant SKU"], [["tee", "TEE-1"]], ["duplicate"]);
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
      columnKeys: Object.keys(analysis.mapping.columns),
      collections: [],
    });
    expect(plan.duplicateRows).toHaveLength(1);
    expect(plan.duplicateRows[0]?.skipped).toBe(false);
    expect(plan.duplicateRows[0]?.newTitle).toBe("Tee (Copy)");
  });

  it("plans archive and delete for matched products when those actions are selected without columns", () => {
    const snapshot = product();
    const archiveAnalysis = analyzeImportSheet(["Handle"], [["tee"]], ["archive"]);
    const deleteAnalysis = analyzeImportSheet(["Handle"], [["tee"]], ["delete"]);
    const catalog = {
      byHandle: new Map([["tee", snapshot]]),
      byId: new Map([[snapshot.productId, snapshot]]),
      bySku: new Map(),
    };
    const archivePlan = buildProductImportPlan({
      matches: archiveAnalysis.records.map((record) => matchImportRecord(record, catalog)),
      sheetIssues: archiveAnalysis.issues,
      operations: archiveAnalysis.operations,
      columnKeys: Object.keys(archiveAnalysis.mapping.columns),
      collections: [],
    });
    const deletePlan = buildProductImportPlan({
      matches: deleteAnalysis.records.map((record) => matchImportRecord(record, catalog)),
      sheetIssues: deleteAnalysis.issues,
      operations: deleteAnalysis.operations,
      columnKeys: Object.keys(deleteAnalysis.mapping.columns),
      collections: [],
    });
    expect(archivePlan.archiveRows).toHaveLength(1);
    expect(archivePlan.archiveRows[0]?.skipped).toBe(false);
    expect(deletePlan.deleteRows).toHaveLength(1);
    expect(deletePlan.deleteRows[0]?.skipped).toBe(false);
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
      columnKeys: Object.keys(analysis.mapping.columns),
      collections: [],
    });
    expect(plan.deleteRows).toHaveLength(1);
    expect(plan.deleteRows[0]?.skipped).toBe(false);
    expect(plan.fieldRows).toHaveLength(0);
    expect(plan.costRows).toHaveLength(0);
    expect(plan.handleRows).toHaveLength(0);
  });

  it("flags too_many_tags when adding a tag would exceed Shopify's 250 limit", () => {
    const snapshot = product({
      tags: Array.from({ length: 250 }, (_, index) => `tag-${index}`),
    });
    const analysis = analyzeImportSheet(["Handle", "Add Tags"], [["tee", "extra"]], ["tags"]);
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
      columnKeys: Object.keys(analysis.mapping.columns),
      collections: [],
    });
    expect(plan.issues.some((issue) => issue.code === "too_many_tags")).toBe(true);
    expect(plan.tagRows[0]?.skipped).toBe(true);
    expect(plan.tagRows[0]?.skipReason).toBe("too_many_tags");
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
      columnKeys: Object.keys(analysis.mapping.columns),
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
      columnKeys: Object.keys(analysis.mapping.columns),
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

  it("plans compare-at without requiring a price change", () => {
    const snapshot = product();
    const analysis = analyzeImportSheet(
      ["Handle", "Variant SKU", "Variant Compare At Price"],
      [["tee", "TEE-1", "20.00"]],
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
      columnKeys: Object.keys(analysis.mapping.columns),
      collections: [],
    });
    expect(plan.priceRows[0]?.priceChanged).toBe(false);
    expect(plan.priceRows[0]?.compareAtChanged).toBe(true);
    expect(plan.priceRows[0]?.afterCompareAt).toBe("20.00");
    expect(plan.priceRows[0]?.skipped).toBe(false);
  });

  it("does not plan archive twice when Status and Archive both archive", () => {
    const snapshot = product();
    const analysis = analyzeImportSheet(
      ["Handle", "Status", "Archive"],
      [["tee", "archived", "true"]],
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
      columnKeys: Object.keys(analysis.mapping.columns),
      collections: [],
    });
    expect(plan.archiveRows).toHaveLength(1);
    expect(plan.statusRows).toHaveLength(0);
  });

  it("plans all matched products without a 200-product cap", () => {
    const snapshots = Array.from({ length: 201 }, (_, index) =>
      product({
        productId: `gid://shopify/Product/${index + 1}`,
        productTitle: `Item ${index + 1}`,
        handle: `item-${index + 1}`,
      }),
    );
    const analysis = analyzeImportSheet(
      ["Handle", "Vendor"],
      snapshots.map((item) => [item.handle, "Acme"]),
    );
    const catalog = {
      byHandle: new Map(snapshots.map((item) => [item.handle, item])),
      byId: new Map(snapshots.map((item) => [item.productId, item])),
      bySku: new Map(),
    };
    const matches = analysis.records.map((record) => matchImportRecord(record, catalog));
    const plan = buildProductImportPlan({
      matches,
      sheetIssues: analysis.issues,
      operations: analysis.operations,
      columnKeys: Object.keys(analysis.mapping.columns),
      collections: [],
    });
    expect(plan.fieldRows.filter((row) => !row.skipped)).toHaveLength(201);
    expect(plan.issues.filter((issue) => issue.code === "too_many_products")).toHaveLength(0);
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
      columnKeys: Object.keys(analysis.mapping.columns),
      collections: [],
    });
    expect(plan.issues.some((issue) => issue.code === "handle_not_found")).toBe(true);
    expect(plan.fieldRows).toHaveLength(0);
  });

  it("reports product_id_not_found when matching by Product ID misses", () => {
    const snapshot = product();
    const analysis = analyzeImportSheet(["ID", "Vendor"], [["999", "Acme"]]);
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
      columnKeys: Object.keys(analysis.mapping.columns),
      collections: [],
    });
    expect(plan.issues.some((issue) => issue.code === "product_id_not_found")).toBe(true);
    expect(plan.issues.some((issue) => issue.code === "handle_not_found")).toBe(false);
  });

  it("plans a native Shopify metafield header and clears blank cells", () => {
    const snapshot = product({
      metafields: [
        { namespace: "custom", key: "custom_description", type: "single_line_text_field", value: "old" },
      ],
    });
    const analysis = analyzeImportSheet(
      ["Handle", "Custom Description (product.metafields.custom.custom_description)"],
      [
        ["tee", "new copy"],
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
      columnKeys: Object.keys(analysis.mapping.columns),
      collections: [],
      metafields: analysis.mapping.metafields,
      definitions: new Map([
        [
          "product:custom.custom_description",
          {
            owner: "product",
            namespace: "custom",
            key: "custom_description",
            type: "single_line_text_field",
          },
        ],
      ]),
    });
    expect(analysis.operations).toContain("metafield");
    expect(plan.metafieldRows).toHaveLength(1);
    expect(plan.metafieldRows[0]?.afterValue).toBe("new copy");
  });

  it("clears a blank metafield on the product row", () => {
    const snapshot = product({
      metafields: [
        { namespace: "custom", key: "custom_description", type: "single_line_text_field", value: "old" },
      ],
    });
    const analysis = analyzeImportSheet(
      ["Handle", "Custom Description (product.metafields.custom.custom_description)"],
      [["tee", ""]],
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
      columnKeys: Object.keys(analysis.mapping.columns),
      collections: [],
      metafields: analysis.mapping.metafields,
      definitions: new Map([
        [
          "product:custom.custom_description",
          {
            owner: "product",
            namespace: "custom",
            key: "custom_description",
            type: "single_line_text_field",
          },
        ],
      ]),
    });
    expect(plan.metafieldRows).toHaveLength(1);
    expect(plan.metafieldRows[0]?.afterValue).toBe("");
    expect(plan.metafieldRows[0]?.skipped).toBe(false);
  });

  it("rejects an empty title and writes an empty price as 0.00", () => {
    const snapshot = product();
    const analysis = analyzeImportSheet(
      ["Handle", "Title", "Variant SKU", "Variant Price"],
      [
        ["tee", "", "TEE-1", ""],
      ],
      ["title", "price"],
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
      columnKeys: Object.keys(analysis.mapping.columns),
      collections: [],
    });
    expect(plan.issues.some((issue) => issue.code === "empty_title")).toBe(true);
    expect(plan.fieldRows.some((row) => row.field === "title" && !row.skipped)).toBe(false);
    expect(plan.priceRows[0]?.afterPrice).toBe("0.00");
    expect(plan.priceRows[0]?.skipped).toBe(false);
  });

  it("does not zero prices on image continuation rows of a multi-variant product", () => {
    const snapshot = product({
      variants: [
        {
          variantId: "gid://shopify/ProductVariant/1",
          title: "S",
          sku: "TEE-S",
          barcode: null,
          price: "10.00",
          compareAtPrice: "12.00",
          inventoryItemId: "gid://shopify/InventoryItem/1",
          cost: "4.00",
          weightValue: null,
          weightUnit: null,
          metafields: [],
        },
        {
          variantId: "gid://shopify/ProductVariant/2",
          title: "M",
          sku: "TEE-M",
          barcode: null,
          price: "11.00",
          compareAtPrice: null,
          inventoryItemId: "gid://shopify/InventoryItem/2",
          cost: "4.00",
          weightValue: null,
          weightUnit: null,
          metafields: [],
        },
      ],
    });
    const analysis = analyzeImportSheet(
      ["Handle", "Variant SKU", "Variant Price", "Variant Compare At Price"],
      [
        ["tee", "TEE-S", "10.00", "12.00"],
        ["tee", "", "", ""],
      ],
      ["price"],
    );
    const catalog = {
      byHandle: new Map([["tee", snapshot]]),
      byId: new Map([[snapshot.productId, snapshot]]),
      bySku: new Map([
        ["tee-s", [snapshot]],
        ["tee-m", [snapshot]],
      ]),
    };
    const matches = matchImportRecords(analysis.records, catalog);
    const plan = buildProductImportPlan({
      matches,
      sheetIssues: analysis.issues,
      operations: analysis.operations,
      columnKeys: Object.keys(analysis.mapping.columns),
      collections: [],
    });
    expect(plan.issues.some((issue) => issue.code === "price_needs_sku")).toBe(false);
    expect(plan.priceRows.filter((row) => !row.skipped)).toHaveLength(0);
  });

  it("does not zero prices on image continuation rows of a single-variant product", () => {
    const snapshot = product({
      variants: [
        {
          variantId: "gid://shopify/ProductVariant/1",
          title: "Default",
          sku: "TEE-1",
          barcode: null,
          price: "10.00",
          compareAtPrice: null,
          inventoryItemId: "gid://shopify/InventoryItem/1",
          cost: "4.00",
          weightValue: null,
          weightUnit: null,
          metafields: [],
        },
      ],
    });
    const analysis = analyzeImportSheet(
      ["Handle", "Title", "Variant SKU", "Variant Price"],
      [
        ["tee", "Tee", "TEE-1", "11.00"],
        ["tee", "", "", ""],
      ],
      ["price"],
    );
    const catalog = {
      byHandle: new Map([["tee", snapshot]]),
      byId: new Map([[snapshot.productId, snapshot]]),
      bySku: new Map([["tee-1", [snapshot]]]),
    };
    const matches = matchImportRecords(analysis.records, catalog);
    const plan = buildProductImportPlan({
      matches,
      sheetIssues: analysis.issues,
      operations: analysis.operations,
      columnKeys: Object.keys(analysis.mapping.columns),
      collections: [],
    });
    const changed = plan.priceRows.filter((row) => !row.skipped);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.afterPrice).toBe("11.00");
  });

  it("reuses the last matched product for later rows with the same Handle", () => {
    const snapshot = product({
      handle: "tee-testbyzz",
      variants: [
        {
          variantId: "gid://shopify/ProductVariant/1",
          title: "Default",
          sku: "TEE-1",
          barcode: null,
          price: "10.00",
          compareAtPrice: null,
          inventoryItemId: "gid://shopify/InventoryItem/1",
          cost: "4.00",
          weightValue: null,
          weightUnit: null,
          metafields: [],
        },
      ],
    });
    const analysis = analyzeImportSheet(
      ["Handle", "Variant SKU", "Vendor"],
      [
        ["tee", "TEE-1", "Acme"],
        ["tee", "", ""],
        ["tee", "", ""],
      ],
    );
    const catalog = {
      byHandle: new Map([["tee-testbyzz", snapshot]]),
      byId: new Map([[snapshot.productId, snapshot]]),
      bySku: new Map([["tee-1", [snapshot]]]),
    };
    const matches = matchImportRecords(analysis.records, catalog);
    const plan = buildProductImportPlan({
      matches,
      sheetIssues: analysis.issues,
      operations: analysis.operations,
      columnKeys: Object.keys(analysis.mapping.columns),
      collections: [],
    });
    expect(matches.every((match) => match.product?.productId === snapshot.productId)).toBe(true);
    expect(plan.issues.some((issue) => issue.code === "handle_not_found")).toBe(false);
    expect(plan.fieldRows.filter((row) => !row.skipped)).toHaveLength(1);
  });

  it("still reports handle_not_found when the next product uses a different Handle", () => {
    const snapshot = product();
    const analysis = analyzeImportSheet(
      ["Handle", "Variant SKU", "Vendor"],
      [
        ["tee", "TEE-1", "Acme"],
        ["missing-handle", "", "Other"],
      ],
    );
    const catalog = {
      byHandle: new Map([["tee", snapshot]]),
      byId: new Map([[snapshot.productId, snapshot]]),
      bySku: new Map([["tee-1", [snapshot]]]),
    };
    const matches = matchImportRecords(analysis.records, catalog);
    const plan = buildProductImportPlan({
      matches,
      sheetIssues: analysis.issues,
      operations: analysis.operations,
      columnKeys: Object.keys(analysis.mapping.columns),
      collections: [],
    });
    expect(plan.issues.some((issue) => issue.code === "handle_not_found")).toBe(true);
  });

  it("writes list.single_line_text_field from comma-separated CSV cells", () => {
    const snapshot = product({
      metafields: [
        { namespace: "custom", key: "chineseword", type: "list.single_line_text_field", value: "[\"old\"]" },
      ],
    });
    const analysis = analyzeImportSheet(
      ["Handle", "汉字无法报错测试 (product.metafields.custom.chineseword)"],
      [["tee", "红, 蓝"]],
    );
    const catalog = {
      byHandle: new Map([["tee", snapshot]]),
      byId: new Map([[snapshot.productId, snapshot]]),
      bySku: new Map(),
    };
    const matches = matchImportRecords(analysis.records, catalog);
    const plan = buildProductImportPlan({
      matches,
      sheetIssues: analysis.issues,
      operations: analysis.operations,
      columnKeys: Object.keys(analysis.mapping.columns),
      collections: [],
      metafields: analysis.mapping.metafields,
      definitions: new Map([
        [
          "product:custom.chineseword",
          {
            owner: "product",
            namespace: "custom",
            key: "chineseword",
            type: "list.single_line_text_field",
          },
        ],
      ]),
    });
    expect(plan.issues.some((issue) => issue.code === "metafield_type_unsupported")).toBe(false);
    expect(plan.metafieldRows[0]?.skipped).toBe(false);
    expect(plan.metafieldRows[0]?.afterValue).toBe('["红","蓝"]');
  });

  it("chunks a plan by product without dropping rows", () => {
    const snapshots = Array.from({ length: 5 }, (_, index) =>
      product({
        productId: `gid://shopify/Product/${index + 1}`,
        productTitle: `Item ${index + 1}`,
        handle: `item-${index + 1}`,
      }),
    );
    const analysis = analyzeImportSheet(
      ["Handle", "Vendor"],
      snapshots.map((item) => [item.handle, "Acme"]),
    );
    const catalog = {
      byHandle: new Map(snapshots.map((item) => [item.handle, item])),
      byId: new Map(snapshots.map((item) => [item.productId, item])),
      bySku: new Map(),
    };
    const plan = buildProductImportPlan({
      matches: analysis.records.map((record) => matchImportRecord(record, catalog)),
      sheetIssues: analysis.issues,
      operations: analysis.operations,
      columnKeys: Object.keys(analysis.mapping.columns),
      collections: [],
    });
    const chunks = chunkImportPlanByProduct(plan, 2);
    expect(chunks).toHaveLength(3);
    expect(chunks.reduce((sum, chunk) => sum + chunk.fieldRows.length, 0)).toBe(plan.fieldRows.length);
  });
});

describe("matchImportRecord SKU disambiguation", () => {
  const original = product();
  const copy = product({
    productId: "gid://shopify/Product/2",
    productTitle: "Tee (Copy)",
    handle: "tee-copy",
    variants: [
      {
        variantId: "gid://shopify/ProductVariant/2",
        title: "Default",
        sku: "TEE-1",
        barcode: null,
        price: "10.00",
        compareAtPrice: null,
        inventoryItemId: "gid://shopify/InventoryItem/2",
        cost: "4.00",
        weightValue: null,
        weightUnit: null,
        metafields: [],
      },
    ],
  });
  const catalog = {
    byHandle: new Map([
      ["tee", original],
      ["tee-copy", copy],
    ]),
    byId: new Map([
      [original.productId, original],
      [copy.productId, copy],
    ]),
    bySku: new Map([["tee-1", [original, copy]]]),
  };

  it("scopes a duplicated SKU to the row Handle", () => {
    const analysis = analyzeImportSheet(
      ["Handle", "Variant SKU", "Variant Price"],
      [["tee-copy", "TEE-1", "12.50"]],
      ["price"],
    );
    const match = matchImportRecord(analysis.records[0]!, catalog);
    expect(match.matchIssues).toEqual([]);
    expect(match.product?.productId).toBe(copy.productId);
    expect(match.variant?.variantId).toBe("gid://shopify/ProductVariant/2");
    const plan = buildProductImportPlan({
      matches: [match],
      sheetIssues: analysis.issues,
      operations: analysis.operations,
      columnKeys: Object.keys(analysis.mapping.columns),
      collections: [],
    });
    expect(plan.issues.some((issue) => issue.code === "sku_matches_multiple")).toBe(false);
    expect(plan.priceRows[0]?.variantId).toBe("gid://shopify/ProductVariant/2");
    expect(plan.priceRows[0]?.afterPrice).toBe("12.50");
  });

  it("scopes a duplicated SKU to the row Product ID", () => {
    const analysis = analyzeImportSheet(
      ["ID", "Variant SKU", "Variant Price"],
      [["2", "TEE-1", "12.50"]],
      ["price"],
    );
    const match = matchImportRecord(analysis.records[0]!, catalog);
    expect(match.matchIssues).toEqual([]);
    expect(match.product?.productId).toBe(copy.productId);
    expect(match.variant?.variantId).toBe("gid://shopify/ProductVariant/2");
  });

  it("still reports sku_matches_multiple when SKU is duplicated and the row has no product identity", () => {
    const analysis = analyzeImportSheet(
      ["Variant SKU", "Variant Price"],
      [["TEE-1", "12.50"]],
      ["price"],
    );
    const match = matchImportRecord(analysis.records[0]!, catalog);
    expect(match.matchIssues.map((issue) => issue.code)).toEqual(["sku_matches_multiple"]);
    expect(match.product).toBeNull();
    expect(match.variant).toBeNull();
  });

  it("still reports sku_matches_multiple when the same SKU appears twice on one product", () => {
    const duplicateOnProduct = product({
      variants: [
        {
          variantId: "gid://shopify/ProductVariant/11",
          title: "S",
          sku: "TEE-1",
          barcode: null,
          price: "10.00",
          compareAtPrice: null,
          inventoryItemId: "gid://shopify/InventoryItem/11",
          cost: "4.00",
          weightValue: null,
          weightUnit: null,
          metafields: [],
        },
        {
          variantId: "gid://shopify/ProductVariant/12",
          title: "M",
          sku: "TEE-1",
          barcode: null,
          price: "11.00",
          compareAtPrice: null,
          inventoryItemId: "gid://shopify/InventoryItem/12",
          cost: "4.00",
          weightValue: null,
          weightUnit: null,
          metafields: [],
        },
      ],
    });
    const sameProductCatalog = {
      byHandle: new Map([["tee", duplicateOnProduct]]),
      byId: new Map([[duplicateOnProduct.productId, duplicateOnProduct]]),
      bySku: new Map([["tee-1", [duplicateOnProduct]]]),
    };
    const analysis = analyzeImportSheet(
      ["Handle", "Variant SKU", "Variant Price"],
      [["tee", "TEE-1", "12.50"]],
      ["price"],
    );
    const match = matchImportRecord(analysis.records[0]!, sameProductCatalog);
    expect(match.matchIssues.map((issue) => issue.code)).toEqual(["sku_matches_multiple"]);
    expect(match.variant).toBeNull();
  });

  it("matches a Shopify CSV variant by Option values when SKU is empty", () => {
    const snapshot = product({
      variants: [
        {
          variantId: "gid://shopify/ProductVariant/1",
          title: "Acrylic / Beige / Handheld",
          sku: "1",
          barcode: null,
          price: "21.00",
          compareAtPrice: "25.00",
          inventoryItemId: "gid://shopify/InventoryItem/1",
          cost: null,
          weightValue: null,
          weightUnit: null,
          metafields: [],
          selectedOptions: [
            { name: "Decoration material", value: "Acrylic" },
            { name: "Color", value: "Beige" },
            { name: "Mounting hardware", value: "Handheld" },
          ],
        },
        {
          variantId: "gid://shopify/ProductVariant/2",
          title: "Acrylic / Beige / Hanger",
          sku: null,
          barcode: null,
          price: "21.00",
          compareAtPrice: "25.00",
          inventoryItemId: "gid://shopify/InventoryItem/2",
          cost: null,
          weightValue: null,
          weightUnit: null,
          metafields: [],
          selectedOptions: [
            { name: "Decoration material", value: "Acrylic" },
            { name: "Color", value: "Beige" },
            { name: "Mounting hardware", value: "Hanger" },
          ],
        },
      ],
    });
    const analysis = analyzeImportSheet(
      ["Handle", "Option1 Value", "Option2 Value", "Option3 Value", "Variant SKU", "Variant Price"],
      [["tee", "Acrylic", "Beige", "Hanger", "", "22.00"]],
      ["price"],
    );
    expect(analysis.records[0]?.option1).toBe("Acrylic");
    const catalog = {
      byHandle: new Map([["tee", snapshot]]),
      byId: new Map([[snapshot.productId, snapshot]]),
      bySku: new Map([["1", [snapshot]]]),
    };
    const match = matchImportRecord(analysis.records[0]!, catalog);
    expect(match.matchIssues).toEqual([]);
    expect(match.variant?.variantId).toBe("gid://shopify/ProductVariant/2");
    const plan = buildProductImportPlan({
      matches: [match],
      sheetIssues: analysis.issues,
      operations: analysis.operations,
      columnKeys: Object.keys(analysis.mapping.columns),
      collections: [],
    });
    expect(plan.issues.some((issue) => issue.code === "price_needs_sku")).toBe(false);
    expect(plan.priceRows[0]?.variantId).toBe("gid://shopify/ProductVariant/2");
    expect(plan.priceRows[0]?.afterPrice).toBe("22.00");
  });

  it("strips the Shopify Excel SKU prefix before matching", () => {
    const snapshot = product({
      variants: [
        {
          variantId: "gid://shopify/ProductVariant/2",
          title: "Bronze",
          sku: "2",
          barcode: null,
          price: "21.00",
          compareAtPrice: null,
          inventoryItemId: "gid://shopify/InventoryItem/2",
          cost: null,
          weightValue: null,
          weightUnit: null,
          metafields: [],
        },
      ],
    });
    const analysis = analyzeImportSheet(
      ["Handle", "Variant SKU", "Variant Price"],
      [["tee", "'2", "22.00"]],
      ["price"],
    );
    expect(analysis.records[0]?.sku).toBe("2");
    const catalog = {
      byHandle: new Map([["tee", snapshot]]),
      byId: new Map([[snapshot.productId, snapshot]]),
      bySku: new Map([["2", [snapshot]]]),
    };
    const match = matchImportRecord(analysis.records[0]!, catalog);
    expect(match.matchIssues).toEqual([]);
    expect(match.variant?.variantId).toBe("gid://shopify/ProductVariant/2");
  });

  it("strips the Excel prefix from Product ID before matching", () => {
    const snapshot = product();
    const analysis = analyzeImportSheet(
      ["ID", "Vendor"],
      [["'1", "Acme"]],
      ["vendor"],
    );
    expect(analysis.records[0]?.productId).toBe("1");
    const catalog = {
      byHandle: new Map([["tee", snapshot]]),
      byId: new Map([[snapshot.productId, snapshot]]),
      bySku: new Map(),
    };
    const match = matchImportRecord(analysis.records[0]!, catalog);
    expect(match.matchIssues).toEqual([]);
    expect(match.product?.productId).toBe(snapshot.productId);
  });

  it("strips the Excel prefix from Option values before matching", () => {
    const snapshot = product({
      variants: [
        {
          variantId: "gid://shopify/ProductVariant/11",
          title: "2",
          sku: "TEE-1",
          barcode: null,
          price: "10.00",
          compareAtPrice: null,
          inventoryItemId: "gid://shopify/InventoryItem/11",
          cost: "4.00",
          weightValue: null,
          weightUnit: null,
          metafields: [],
          selectedOptions: [{ name: "Size", value: "2" }],
        },
        {
          variantId: "gid://shopify/ProductVariant/12",
          title: "4",
          sku: "TEE-1",
          barcode: null,
          price: "11.00",
          compareAtPrice: null,
          inventoryItemId: "gid://shopify/InventoryItem/12",
          cost: "4.00",
          weightValue: null,
          weightUnit: null,
          metafields: [],
          selectedOptions: [{ name: "Size", value: "4" }],
        },
      ],
    });
    const catalog = {
      byHandle: new Map([["tee", snapshot]]),
      byId: new Map([[snapshot.productId, snapshot]]),
      bySku: new Map([["tee-1", [snapshot]]]),
    };
    const analysis = analyzeImportSheet(
      ["Handle", "Option1 Value", "Variant SKU", "Variant Price"],
      [["tee", "'2", "TEE-1", "12.50"]],
      ["price"],
    );
    expect(analysis.records[0]?.option1).toBe("2");
    const match = matchImportRecord(analysis.records[0]!, catalog);
    expect(match.matchIssues).toEqual([]);
    expect(match.variant?.variantId).toBe("gid://shopify/ProductVariant/11");
  });

  it("strips the Excel prefix from price, compare-at, and cost", () => {
    const snapshot = product({
      variants: [
        {
          variantId: "gid://shopify/ProductVariant/1",
          title: "Default",
          sku: "TEE-1",
          barcode: null,
          price: "10.00",
          compareAtPrice: "12.00",
          inventoryItemId: "gid://shopify/InventoryItem/1",
          cost: "4.00",
          weightValue: null,
          weightUnit: null,
          metafields: [],
        },
      ],
    });
    const analysis = analyzeImportSheet(
      ["Handle", "Variant SKU", "Variant Price", "Variant Compare At Price", "Cost per item"],
      [["tee", "TEE-1", "'22.00", "'25.00", "'5.50"]],
      ["price", "cost"],
    );
    expect(analysis.records[0]?.cells.price).toBe("22.00");
    expect(analysis.records[0]?.cells.compare_at).toBe("25.00");
    expect(analysis.records[0]?.cells.cost).toBe("5.50");
    expect(analysis.issues.some((issue) => issue.code === "invalid_price")).toBe(false);
    expect(analysis.issues.some((issue) => issue.code === "invalid_cost")).toBe(false);
    const catalog = {
      byHandle: new Map([["tee", snapshot]]),
      byId: new Map([[snapshot.productId, snapshot]]),
      bySku: new Map([["tee-1", [snapshot]]]),
    };
    const match = matchImportRecord(analysis.records[0]!, catalog);
    const plan = buildProductImportPlan({
      matches: [match],
      sheetIssues: analysis.issues,
      operations: analysis.operations,
      columnKeys: Object.keys(analysis.mapping.columns),
      collections: [],
    });
    expect(plan.priceRows[0]?.afterPrice).toBe("22.00");
    expect(plan.priceRows[0]?.afterCompareAt).toBe("25.00");
    expect(plan.costRows[0]?.afterCost).toBe("5.50");
  });

  it("uses Option values to split a duplicated SKU on the same product", () => {
    const snapshot = product({
      variants: [
        {
          variantId: "gid://shopify/ProductVariant/11",
          title: "S",
          sku: "TEE-1",
          barcode: null,
          price: "10.00",
          compareAtPrice: null,
          inventoryItemId: "gid://shopify/InventoryItem/11",
          cost: "4.00",
          weightValue: null,
          weightUnit: null,
          metafields: [],
          selectedOptions: [{ name: "Size", value: "S" }],
        },
        {
          variantId: "gid://shopify/ProductVariant/12",
          title: "M",
          sku: "TEE-1",
          barcode: null,
          price: "11.00",
          compareAtPrice: null,
          inventoryItemId: "gid://shopify/InventoryItem/12",
          cost: "4.00",
          weightValue: null,
          weightUnit: null,
          metafields: [],
          selectedOptions: [{ name: "Size", value: "M" }],
        },
      ],
    });
    const catalog = {
      byHandle: new Map([["tee", snapshot]]),
      byId: new Map([[snapshot.productId, snapshot]]),
      bySku: new Map([["tee-1", [snapshot]]]),
    };
    const analysis = analyzeImportSheet(
      ["Handle", "Option1 Value", "Variant SKU", "Variant Price"],
      [["tee", "M", "TEE-1", "12.50"]],
      ["price"],
    );
    const match = matchImportRecord(analysis.records[0]!, catalog);
    expect(match.matchIssues).toEqual([]);
    expect(match.variant?.variantId).toBe("gid://shopify/ProductVariant/12");
  });

  it("keeps the Handle product when a SKU also exists on another product", () => {
    const original = product();
    const copy = product({
      productId: "gid://shopify/Product/2",
      handle: "tee-copy",
      productTitle: "Tee Copy",
      variants: [
        {
          variantId: "gid://shopify/ProductVariant/9",
          title: "Default",
          sku: "COPY-1",
          barcode: null,
          price: "10.00",
          compareAtPrice: null,
          inventoryItemId: "gid://shopify/InventoryItem/9",
          cost: "4.00",
          weightValue: null,
          weightUnit: null,
          metafields: [],
        },
      ],
    });
    const catalog = {
      byHandle: new Map([
        ["tee", original],
        ["tee-copy", copy],
      ]),
      byId: new Map([
        [original.productId, original],
        [copy.productId, copy],
      ]),
      bySku: new Map([
        ["tee-1", [original]],
        ["copy-1", [copy]],
      ]),
    };
    const analysis = analyzeImportSheet(
      ["Handle", "Option1 Value", "Variant SKU", "Variant Price"],
      [["tee-copy", "Default", "TEE-1", "12.50"]],
      ["price"],
    );
    const match = matchImportRecord(analysis.records[0]!, catalog);
    expect(match.product?.productId).toBe(copy.productId);
    expect(match.variant?.variantId).toBe("gid://shopify/ProductVariant/9");
    expect(match.matchIssues).toEqual([]);
  });
});

describe("stripExcelTextPrefix", () => {
  it("strips a single leading apostrophe from Shopify Excel exports", () => {
    expect(stripExcelTextPrefix("'2")).toBe("2");
    expect(stripExcelTextPrefix("'22.00")).toBe("22.00");
    expect(stripExcelTextPrefix("TEE-1")).toBe("TEE-1");
    expect(stripExcelTextPrefix("'")).toBe("'");
    expect(normalizeImportSku("'2")).toBe("2");
  });
});

describe("product import identity", () => {
  function catalogFor(snapshot: ProductImportProductSnapshot) {
    const sku = snapshot.variants[0]?.sku?.toLowerCase() ?? "";
    return {
      byHandle: new Map([[snapshot.handle, snapshot]]),
      byId: new Map([[snapshot.productId, snapshot]]),
      bySku: new Map(sku ? [[sku, [snapshot]]] : []),
    };
  }

  it("writes Variant SKU when the row matched by Handle and options", () => {
    const snapshot = product({
      variants: [
        {
          ...product().variants[0]!,
          title: "S",
          selectedOptions: [{ name: "Size", value: "S" }],
        },
      ],
    });
    const analysis = analyzeImportSheet(
      ["Handle", "Option1 Value", "Variant SKU"],
      [["tee", "S", "TEE-NEW"]],
      ["sku"],
    );
    const plan = buildProductImportPlan({
      matches: analysis.records.map((record) => matchImportRecord(record, catalogFor(snapshot))),
      sheetIssues: analysis.issues,
      operations: analysis.operations,
      columnKeys: Object.keys(analysis.mapping.columns),
      collections: [],
    });
    expect(plan.identityRows[0]).toMatchObject({ afterSku: "TEE-NEW", skuChanged: true, skipped: false });
    expect(plan.issues.some((issue) => issue.code === "sku_is_identity_only")).toBe(false);
  });

  it("requires New SKU when the row matched by SKU only", () => {
    const snapshot = product();
    const analysis = analyzeImportSheet(["Variant SKU"], [["TEE-1"]], ["sku"]);
    const plan = buildProductImportPlan({
      matches: analysis.records.map((record) => matchImportRecord(record, catalogFor(snapshot))),
      sheetIssues: analysis.issues,
      operations: analysis.operations,
      columnKeys: Object.keys(analysis.mapping.columns),
      collections: [],
    });
    expect(plan.issues.map((issue) => issue.code)).toContain("sku_is_identity_only");
    expect(plan.identityRows).toEqual([]);
  });

  it("writes barcode and grams from native Shopify columns", () => {
    const snapshot = product({
      variants: [
        {
          ...product().variants[0]!,
          barcode: "111",
          weightValue: 100,
          weightUnit: "GRAMS",
        },
      ],
    });
    const analysis = analyzeImportSheet(
      ["Handle", "Variant Barcode", "Variant Grams"],
      [["tee", "999", "250"]],
      ["barcode", "weight"],
    );
    const plan = buildProductImportPlan({
      matches: analysis.records.map((record) => matchImportRecord(record, catalogFor(snapshot))),
      sheetIssues: analysis.issues,
      operations: analysis.operations,
      columnKeys: Object.keys(analysis.mapping.columns),
      collections: [],
    });
    expect(plan.identityRows[0]).toMatchObject({
      afterBarcode: "999",
      barcodeChanged: true,
      afterWeight: "250 grams",
      weightChanged: true,
      skipped: false,
    });
  });
});

describe("collapseRepeatedImportIssues", () => {
  it("collapses the same missing handle into one row range", () => {
    const collapsed = collapseRepeatedImportIssues([
      { rowNumber: 14, code: "handle_not_found", column: "handle", value: "tee" },
      { rowNumber: 15, code: "handle_not_found", column: "handle", value: "tee" },
      { rowNumber: 16, code: "handle_not_found", column: "handle", value: "tee" },
      { rowNumber: 2, code: "collection_not_found", column: "collection", value: "Missing" },
    ]);
    expect(collapsed).toEqual([
      expect.objectContaining({
        code: "handle_not_found",
        rowNumber: 14,
        rowLabel: "14–16",
        value: "tee",
      }),
      expect.objectContaining({ code: "collection_not_found", rowNumber: 2 }),
    ]);
  });
});
