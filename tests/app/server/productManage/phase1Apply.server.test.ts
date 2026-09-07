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
  it("drops skipped rows", () => {
    expect(
      buildBulkCollectionEditWritableRows([
        collectionRow(),
        collectionRow({ productId: "gid://shopify/Product/2", skipped: true, skipReason: "already_in" }),
      ]).map((row) => row.productId),
    ).toEqual(["gid://shopify/Product/1"]);
  });

  it("adds with collectionAddProducts and flags pending remove jobs", async () => {
    const { admin, calls } = createAdmin((call) => {
      if (String(call.query).includes("collectionRemoveProducts")) {
        return {
          data: {
            collectionRemoveProducts: { job: { id: "job-1", done: false }, userErrors: [] },
          },
        };
      }
      return { data: { collectionAddProducts: { userErrors: [] } } };
    });
    const add = await applyBulkCollectionEdit({
      admin: asAdmin(admin),
      shop: "s",
      collectionId: "gid://shopify/Collection/1",
      action: "add",
      rows: [collectionRow()],
    });
    expect(calls[0]?.query).toContain("collectionAddProducts");
    expect(add.pendingJob).toBeUndefined();

    const remove = await applyBulkCollectionEdit({
      admin: asAdmin(admin),
      shop: "s",
      collectionId: "gid://shopify/Collection/1",
      action: "remove",
      rows: [collectionRow({ action: "remove", inCollection: true })],
    });
    expect(calls[1]?.query).toContain("collectionRemoveProducts");
    expect(remove.pendingJob).toBe(true);
  });
});
