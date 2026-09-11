import { describe, expect, it, vi } from "vitest";
import {
  applyBulkProductFieldEdit,
  buildBulkProductFieldEditWritableRows,
} from "../../../../app/server/bulkProductFieldEdit/bulkProductFieldEditApply.server";
import type { BulkProductFieldEditRow } from "../../../../app/lib/bulkProductFieldEdit";
import {
  applyBulkArchive,
  buildBulkArchiveWritableRows,
} from "../../../../app/server/bulkArchive/bulkArchiveApply.server";
import type { BulkArchiveRow } from "../../../../app/lib/bulkArchive";
import {
  applyProductDuplicate,
  buildProductDuplicateWritableRows,
} from "../../../../app/server/productDuplicate/productDuplicateApply.server";
import type { ProductDuplicateRow } from "../../../../app/lib/productDuplicate";
import {
  applyBulkCollectionEdit,
  buildBulkCollectionEditWritableRows,
} from "../../../../app/server/bulkCollectionEdit/bulkCollectionEditApply.server";
import type { BulkCollectionEditRow } from "../../../../app/lib/bulkCollectionEdit";
import { applyBulkCostEdit } from "../../../../app/server/bulkCostEdit/bulkCostEditApply.server";
import type { BulkCostEditRow } from "../../../../app/lib/bulkCostEdit";
import { applyBulkHandleEdit } from "../../../../app/server/bulkHandleEdit/bulkHandleEditApply.server";
import type { BulkHandleEditRow } from "../../../../app/lib/bulkHandleEdit";
import { applyBulkMetafieldEdit } from "../../../../app/server/bulkMetafieldEdit/bulkMetafieldEditApply.server";
import type { BulkMetafieldEditRow } from "../../../../app/lib/bulkMetafieldEdit";
import { applyBulkProductDelete } from "../../../../app/server/bulkProductDelete/bulkProductDeleteApply.server";
import type { BulkProductDeleteRow } from "../../../../app/lib/bulkProductDelete";

type GraphqlCall = { query: string; variables: Record<string, unknown> };

function createAdmin(
  handler: (call: GraphqlCall) => unknown = () => ({ data: {} }),
): { admin: { graphql: ReturnType<typeof vi.fn> }; calls: GraphqlCall[] } {
  const calls: GraphqlCall[] = [];
  const graphql = vi.fn(async (query: string, init?: { variables?: Record<string, unknown> }) => {
    const call = { query, variables: init?.variables ?? {} };
    calls.push(call);
    return { ok: true, status: 200, json: async () => handler(call) };
  });
  return { admin: { graphql }, calls };
}

const asAdmin = (admin: { graphql: ReturnType<typeof vi.fn> }) =>
  admin as unknown as Parameters<typeof applyBulkProductFieldEdit>[0]["admin"];

function fieldRow(overrides: Partial<BulkProductFieldEditRow> = {}): BulkProductFieldEditRow {
  return {
    productId: "gid://shopify/Product/1",
    productTitle: "商品",
    field: "vendor",
    beforeValue: "Old",
    afterValue: "New",
    skipped: false,
    ...overrides,
  };
}

function archiveRow(overrides: Partial<BulkArchiveRow> = {}): BulkArchiveRow {
  return {
    productId: "gid://shopify/Product/1",
    productTitle: "商品",
    beforeStatus: "ACTIVE",
    afterStatus: "ARCHIVED",
    skipped: false,
    ...overrides,
  };
}

function duplicateRow(overrides: Partial<ProductDuplicateRow> = {}): ProductDuplicateRow {
  return {
    productId: "gid://shopify/Product/1",
    productTitle: "商品",
    newTitle: "商品 (Copy)",
    sourceStatus: "ACTIVE",
    newStatus: "DRAFT",
    includeImages: true,
    skipped: false,
    ...overrides,
  };
}

function collectionRow(overrides: Partial<BulkCollectionEditRow> = {}): BulkCollectionEditRow {
  return {
    productId: "gid://shopify/Product/1",
    productTitle: "商品",
    status: "ACTIVE",
    inCollection: false,
    action: "add",
    skipped: false,
    ...overrides,
  };
}

describe("bulk product field edit apply", () => {
  it("drops skipped and unchanged rows", () => {
    expect(
      buildBulkProductFieldEditWritableRows([
        fieldRow(),
        fieldRow({ productId: "gid://shopify/Product/2", skipped: true, skipReason: "no_change" }),
        fieldRow({ productId: "gid://shopify/Product/3", afterValue: "Old" }),
      ]).map((row) => row.productId),
    ).toEqual(["gid://shopify/Product/1"]);
  });

  it("writes only seo.title when editing SEO title", async () => {
    const { admin, calls } = createAdmin();
    const outcome = await applyBulkProductFieldEdit({
      admin: asAdmin(admin),
      shop: "s",
      rows: [fieldRow({ field: "seoTitle", beforeValue: "", afterValue: "New title" })],
    });
    expect(calls[0]?.query).toContain("ProductUpdateInput");
    expect(calls[0]?.variables).toEqual({
      product: { id: "gid://shopify/Product/1", seo: { title: "New title" } },
    });
    expect(outcome.succeeded).toBe(1);
    expect(outcome.failed).toBe(0);
  });

  it("writes title and descriptionHtml", async () => {
    const { admin, calls } = createAdmin();
    await applyBulkProductFieldEdit({
      admin: asAdmin(admin),
      shop: "s",
      rows: [
        fieldRow({ field: "title", beforeValue: "旧", afterValue: "新" }),
        fieldRow({
          productId: "gid://shopify/Product/2",
          field: "descriptionHtml",
          beforeValue: "",
          afterValue: "<p>hi</p>",
        }),
      ],
    });
    expect(calls[0]?.variables).toEqual({
      product: { id: "gid://shopify/Product/1", title: "新" },
    });
    expect(calls[1]?.variables).toEqual({
      product: { id: "gid://shopify/Product/2", descriptionHtml: "<p>hi</p>" },
    });
  });
});

describe("bulk archive apply", () => {
  it("only writes ARCHIVED rows", () => {
    expect(
      buildBulkArchiveWritableRows([
        archiveRow(),
        archiveRow({ productId: "gid://shopify/Product/2", skipped: true, skipReason: "no_change" }),
      ]).map((row) => row.productId),
    ).toEqual(["gid://shopify/Product/1"]);
  });

  it("sends status ARCHIVED", async () => {
    const { admin, calls } = createAdmin();
    await applyBulkArchive({ admin: asAdmin(admin), shop: "s", rows: [archiveRow()] });
    expect(calls[0]?.variables).toEqual({
      product: { id: "gid://shopify/Product/1", status: "ARCHIVED" },
    });
  });
});

describe("product duplicate apply", () => {
  it("drops skipped and empty-title rows", () => {
    expect(
      buildProductDuplicateWritableRows([
        duplicateRow(),
        duplicateRow({ productId: "gid://shopify/Product/2", skipped: true, skipReason: "empty_title" }),
        duplicateRow({ productId: "gid://shopify/Product/3", newTitle: "   " }),
      ]).map((row) => row.productId),
    ).toEqual(["gid://shopify/Product/1"]);
  });

  it("calls productDuplicate with draft + images", async () => {
    const { admin, calls } = createAdmin(() => ({
      data: { productDuplicate: { newProduct: { id: "gid://shopify/Product/99" }, userErrors: [] } },
    }));
    const outcome = await applyProductDuplicate({
      admin: asAdmin(admin),
      shop: "s",
      rows: [duplicateRow()],
    });
    expect(calls[0]?.query).toContain("productDuplicate");
    expect(calls[0]?.variables).toEqual({
      productId: "gid://shopify/Product/1",
      newTitle: "商品 (Copy)",
      includeImages: true,
      newStatus: "DRAFT",
    });
    expect(outcome.succeeded).toBe(1);
  });
});

describe("bulk collection edit apply", () => {
  const collectionSnapshot = {
    data: {
      collection: {
        id: "gid://shopify/Collection/1",
        title: "夏季",
        sources: [
          {
            __typename: "CollectionConditionsSource",
            id: "gid://shopify/CollectionConditionsSource/1",
            targetType: "PRODUCTS",
            shareable: false,
          },
        ],
      },
    },
  };

  it("drops skipped rows", () => {
    expect(
      buildBulkCollectionEditWritableRows([
        collectionRow(),
        collectionRow({ productId: "gid://shopify/Product/2", skipped: true, skipReason: "already_in" }),
      ]).map((row) => row.productId),
    ).toEqual(["gid://shopify/Product/1"]);
  });

  it("adds with collectionUpdate source selections and flags pending jobs", async () => {
    const { admin, calls } = createAdmin((call) => {
      if (String(call.query).includes("collectionUpdate")) {
        const collection = call.variables.collection as {
          sourcesToUpdate?: Array<{ condition?: { inclusion?: { selectionsToRemove?: unknown } } }>;
        };
        const removing = Boolean(collection.sourcesToUpdate?.[0]?.condition?.inclusion?.selectionsToRemove);
        return {
          data: {
            collectionUpdate: {
              job: removing ? { id: "job-1", done: false } : null,
              userErrors: [],
            },
          },
        };
      }
      return collectionSnapshot;
    });
    const add = await applyBulkCollectionEdit({
      admin: asAdmin(admin),
      shop: "s",
      collectionId: "gid://shopify/Collection/1",
      action: "add",
      rows: [collectionRow()],
    });
    expect(calls[1]?.query).toContain("collectionUpdate");
    expect(calls[1]?.variables).toEqual({
      collection: {
        id: "gid://shopify/Collection/1",
        sourcesToUpdate: [
          {
            condition: {
              id: "gid://shopify/CollectionConditionsSource/1",
              inclusion: { selectionsToAdd: [{ productId: "gid://shopify/Product/1" }] },
              exclusion: { selectionsToRemove: [{ productId: "gid://shopify/Product/1" }] },
            },
          },
        ],
      },
    });
    expect(add.pendingJob).toBeUndefined();

    const remove = await applyBulkCollectionEdit({
      admin: asAdmin(admin),
      shop: "s",
      collectionId: "gid://shopify/Collection/1",
      action: "remove",
      rows: [collectionRow({ action: "remove", inCollection: true })],
    });
    expect(calls[3]?.query).toContain("collectionUpdate");
    expect(remove.pendingJob).toBe(true);
  });

  it("fails all rows when the collection has no writable source", async () => {
    const { admin, calls } = createAdmin(() => ({
      data: {
        collection: {
          id: "gid://shopify/Collection/1",
          title: "精选",
          sources: [{ __typename: "CollectionSubCollectionsSource", id: "gid://shopify/CollectionSubCollectionsSource/1" }],
        },
      },
    }));
    const outcome = await applyBulkCollectionEdit({
      admin: asAdmin(admin),
      shop: "s",
      collectionId: "gid://shopify/Collection/1",
      action: "add",
      rows: [collectionRow()],
    });
    expect(calls.some((call) => String(call.query).includes("collectionUpdate"))).toBe(false);
    expect(outcome.succeeded).toBe(0);
    expect(outcome.failed).toBe(1);
  });
});

describe("bulk cost edit apply", () => {
  it("sends inventoryItem.cost without price", async () => {
    const { admin, calls } = createAdmin();
    const row: BulkCostEditRow = {
      variantId: "gid://shopify/ProductVariant/1",
      productId: "gid://shopify/Product/1",
      productTitle: "Tee",
      variantTitle: "Default",
      sku: "TEE-1",
      inventoryItemId: "gid://shopify/InventoryItem/1",
      beforeCost: "4.00",
      afterCost: "5.50",
      skipped: false,
    };
    await applyBulkCostEdit({ admin: asAdmin(admin), shop: "s", rows: [row] });
    expect(calls[0]?.query).toContain("productVariantsBulkUpdate");
    expect(calls[0]?.variables).toEqual({
      productId: "gid://shopify/Product/1",
      variants: [{ id: "gid://shopify/ProductVariant/1", inventoryItem: { cost: "5.50" } }],
    });
  });
});

describe("bulk handle edit apply", () => {
  it("updates handle with redirectNewHandle", async () => {
    const { admin, calls } = createAdmin();
    const row: BulkHandleEditRow = {
      productId: "gid://shopify/Product/1",
      productTitle: "Tee",
      beforeHandle: "tee",
      afterHandle: "new-tee",
      skipped: false,
    };
    await applyBulkHandleEdit({ admin: asAdmin(admin), shop: "s", rows: [row] });
    expect(calls[0]?.variables).toEqual({
      product: { id: "gid://shopify/Product/1", handle: "new-tee", redirectNewHandle: true },
    });
  });
});

describe("bulk metafield edit apply", () => {
  it("sets values and deletes empty ones", async () => {
    const { admin, calls } = createAdmin();
    const setRow: BulkMetafieldEditRow = {
      ownerId: "gid://shopify/Product/1",
      owner: "product",
      productId: "gid://shopify/Product/1",
      productTitle: "Tee",
      namespace: "custom",
      key: "fabric",
      type: "single_line_text_field",
      beforeValue: "cotton",
      afterValue: "linen",
      action: "set",
      skipped: false,
    };
    const deleteRow: BulkMetafieldEditRow = {
      ...setRow,
      key: "origin",
      beforeValue: "china",
      afterValue: "",
      action: "delete",
    };
    await applyBulkMetafieldEdit({ admin: asAdmin(admin), shop: "s", rows: [setRow, deleteRow] });
    expect(calls[0]?.query).toContain("metafieldsSet");
    expect(calls[1]?.query).toContain("metafieldsDelete");
  });
});

describe("bulk product delete apply", () => {
  it("sends productDelete", async () => {
    const { admin, calls } = createAdmin(() => ({
      data: { productDelete: { deletedProductId: "gid://shopify/Product/1", userErrors: [] } },
    }));
    const row: BulkProductDeleteRow = {
      productId: "gid://shopify/Product/1",
      productTitle: "Tee",
      handle: "tee",
      skipped: false,
    };
    const outcome = await applyBulkProductDelete({ admin: asAdmin(admin), shop: "s", rows: [row] });
    expect(calls[0]?.query).toContain("productDelete");
    expect(calls[0]?.variables).toEqual({ input: { id: "gid://shopify/Product/1" } });
    expect(outcome.succeeded).toBe(1);
  });
});
