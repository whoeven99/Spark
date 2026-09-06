import { describe, expect, it, vi } from "vitest";
import {
  applyBulkPriceEdit,
  buildBulkPriceEditBatches,
} from "../../../../app/server/bulkPriceEdit/bulkPriceEditApply.server";
import {
  BULK_PRICE_EDIT_VARIANTS_PER_MUTATION,
  type BulkPriceEditRow,
} from "../../../../app/lib/bulkPriceEdit";
import type { ShopifyAdminGraphqlClient } from "../../../../app/server/ai/skills/shopifyInfo/shopifyInfo.tool";

const row = (overrides: Partial<BulkPriceEditRow> = {}): BulkPriceEditRow => ({
  variantId: "gid://shopify/ProductVariant/1",
  productId: "gid://shopify/Product/1",
  productTitle: "Mug",
  variantTitle: "Default",
  sku: "MUG-1",
  beforePrice: "20.00",
  afterPrice: "18.00",
  beforeCompareAt: null,
  afterCompareAt: null,
  priceChanged: true,
  compareAtChanged: false,
  skipped: false,
  ...overrides,
});

type GraphqlPayload = {
  productVariants?: Array<{ id: string }>;
  userErrors?: Array<{ field?: string[] | null; message: string }>;
};

/** 按 productId 决定每次 mutation 的返回，便于验证「单商品失败不阻塞其它商品」。 */
function fakeAdmin(
  respond: (productId: string, variantIds: string[]) => GraphqlPayload | Error,
): { admin: ShopifyAdminGraphqlClient; calls: Array<{ productId: string; variantIds: string[] }> } {
  const calls: Array<{ productId: string; variantIds: string[] }> = [];
  const graphql = vi.fn(async (_query: string, options?: { variables?: Record<string, unknown> }) => {
    const productId = String(options?.variables?.productId ?? "");
    const variants = (options?.variables?.variants ?? []) as Array<{ id: string }>;
    const variantIds = variants.map((v) => v.id);
    calls.push({ productId, variantIds });
    const outcome = respond(productId, variantIds);
    if (outcome instanceof Error) throw outcome;
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { productVariantsBulkUpdate: outcome } }),
    };
  });
  return { admin: { graphql } as unknown as ShopifyAdminGraphqlClient, calls };
}

describe("buildBulkPriceEditBatches", () => {
  it("drops skipped and unchanged rows", () => {
    const batches = buildBulkPriceEditBatches([
      row({ variantId: "v1" }),
      row({ variantId: "v2", skipped: true, skipReason: "no_change" }),
      row({ variantId: "v3", priceChanged: false, compareAtChanged: false }),
    ]);
    expect(batches).toHaveLength(1);
    expect(batches[0].variants.map((v) => v.id)).toEqual(["v1"]);
  });

  it("groups by product and only submits changed fields", () => {
    const batches = buildBulkPriceEditBatches([
      row({ variantId: "v1", productId: "p1" }),
      row({
        variantId: "v2",
        productId: "p2",
        priceChanged: false,
        compareAtChanged: true,
        afterCompareAt: "29.00",
      }),
    ]);
    expect(batches.map((b) => b.productId)).toEqual(["p1", "p2"]);
    expect(batches[0].variants[0]).toEqual({ id: "v1", price: "18.00" });
    expect(batches[1].variants[0]).toEqual({ id: "v2", compareAtPrice: "29.00" });
  });

  it("splits a product with more variants than one mutation allows", () => {
    const rows = Array.from({ length: BULK_PRICE_EDIT_VARIANTS_PER_MUTATION + 3 }, (_, i) =>
      row({ variantId: `v${i}` }),
    );
    const batches = buildBulkPriceEditBatches(rows);
    expect(batches).toHaveLength(2);
    expect(batches[0].variants).toHaveLength(BULK_PRICE_EDIT_VARIANTS_PER_MUTATION);
    expect(batches[1].variants).toHaveLength(3);
  });
});

describe("applyBulkPriceEdit", () => {
  it("counts variants returned by Shopify as succeeded", async () => {
    const { admin, calls } = fakeAdmin((_productId, variantIds) => ({
      productVariants: variantIds.map((id) => ({ id })),
      userErrors: [],
    }));
    const outcome = await applyBulkPriceEdit({
      admin,
      shop: "test.myshopify.com",
      rows: [row({ variantId: "v1" }), row({ variantId: "v2" })],
    });
    expect(calls).toHaveLength(1);
    expect(outcome.succeeded).toBe(2);
    expect(outcome.failed).toBe(0);
    expect(outcome.errors).toEqual([]);
  });

  it("keeps other products writing when one product returns userErrors", async () => {
    const { admin } = fakeAdmin((productId, variantIds) =>
      productId === "p2"
        ? { productVariants: [], userErrors: [{ message: "Price must be positive" }] }
        : { productVariants: variantIds.map((id) => ({ id })), userErrors: [] },
    );
    const outcome = await applyBulkPriceEdit({
      admin,
      shop: "test.myshopify.com",
      rows: [
        row({ variantId: "v1", productId: "p1" }),
        row({ variantId: "v2", productId: "p2" }),
        row({ variantId: "v3", productId: "p3" }),
      ],
    });
    expect(outcome.succeeded).toBe(2);
    expect(outcome.failed).toBe(1);
    expect(outcome.errors).toEqual([
      { variantId: "v2", message: "Price must be positive" },
    ]);
  });

  it("records a thrown request as a failed batch instead of rejecting", async () => {
    const { admin } = fakeAdmin((productId, variantIds) =>
      productId === "p1"
        ? new Error("socket hang up")
        : { productVariants: variantIds.map((id) => ({ id })), userErrors: [] },
    );
    const outcome = await applyBulkPriceEdit({
      admin,
      shop: "test.myshopify.com",
      rows: [row({ variantId: "v1", productId: "p1" }), row({ variantId: "v2", productId: "p2" })],
    });
    expect(outcome.succeeded).toBe(1);
    expect(outcome.errors).toEqual([{ variantId: "v1", message: "socket hang up" }]);
  });

  it("caps the stored error list", async () => {
    const { admin } = fakeAdmin(() => ({
      productVariants: [],
      userErrors: [{ message: "nope" }],
    }));
    const rows = Array.from({ length: 60 }, (_, i) =>
      row({ variantId: `v${i}`, productId: `p${i}` }),
    );
    const outcome = await applyBulkPriceEdit({ admin, shop: "test.myshopify.com", rows });
    expect(outcome.failed).toBe(60);
    expect(outcome.errors).toHaveLength(50);
  });
});
