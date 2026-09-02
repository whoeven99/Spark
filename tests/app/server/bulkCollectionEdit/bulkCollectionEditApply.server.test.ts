import { describe, expect, it, vi } from "vitest";
import {
  applyBulkCollectionEdit,
  buildBulkCollectionEditWritableRows,
} from "../../../../app/server/bulkCollectionEdit/bulkCollectionEditApply.server";
import type { BulkCollectionEditRow } from "../../../../app/lib/bulkCollectionEdit";

type GraphqlCall = { query: string; variables: Record<string, unknown> };

const COLLECTION_ID = "gid://shopify/Collection/42";

function row(overrides: Partial<BulkCollectionEditRow> = {}): BulkCollectionEditRow {
  return {
    productId: "gid://shopify/Product/1",
    productTitle: "商品",
    status: "ACTIVE",
    beforeInCollection: false,
    afterInCollection: true,
    skipped: false,
    ...overrides,
  };
}

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
  admin as unknown as Parameters<typeof applyBulkCollectionEdit>[0]["admin"];

const productIdsOf = (call: GraphqlCall) => call.variables.productIds as string[];

describe("buildBulkCollectionEditWritableRows", () => {
  it("剔除跳过行、前后归属相同的行与方向不符的行", () => {
    const rows = [
      row(),
      row({ productId: "gid://shopify/Product/2", skipped: true, skipReason: "already_in" }),
      row({ productId: "gid://shopify/Product/3", beforeInCollection: true }),
      row({
        productId: "gid://shopify/Product/4",
        beforeInCollection: true,
        afterInCollection: false,
      }),
    ];
    expect(buildBulkCollectionEditWritableRows(rows, "add").map((r) => r.productId)).toEqual([
      "gid://shopify/Product/1",
    ]);
    expect(buildBulkCollectionEditWritableRows(rows, "remove").map((r) => r.productId)).toEqual([
      "gid://shopify/Product/4",
    ]);
  });
});

describe("applyBulkCollectionEdit（加入）", () => {
  it("一批提交所有商品", async () => {
    const { admin, calls } = createAdmin(() => ({
      data: { collectionAddProducts: { userErrors: [] } },
    }));
    const outcome = await applyBulkCollectionEdit({
      admin: asAdmin(admin),
      shop: "s",
      collectionId: COLLECTION_ID,
      action: "add",
      rows: [row(), row({ productId: "gid://shopify/Product/2" })],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].variables.id).toBe(COLLECTION_ID);
    expect(productIdsOf(calls[0])).toHaveLength(2);
    expect(outcome.succeeded).toBe(2);
    expect(outcome.failed).toBe(0);
  });

  it("整批被回滚时逐个重试，只把坏行记为失败", async () => {
    const bad = "gid://shopify/Product/2";
    const { admin, calls } = createAdmin((call) => {
      const ids = productIdsOf(call);
      return ids.includes(bad)
        ? { data: { collectionAddProducts: { userErrors: [{ message: "already in" }] } } }
        : { data: { collectionAddProducts: { userErrors: [] } } };
    });
    const outcome = await applyBulkCollectionEdit({
      admin: asAdmin(admin),
      shop: "s",
      collectionId: COLLECTION_ID,
      action: "add",
      rows: [row(), row({ productId: bad }), row({ productId: "gid://shopify/Product/3" })],
    });

    // 1 次整批 + 3 次逐个重试
    expect(calls).toHaveLength(4);
    expect(outcome.succeeded).toBe(2);
    expect(outcome.failed).toBe(1);
    expect(outcome.errors[0].productId).toBe(bad);
  });

  it("跳过行不会产生任何 mutation", async () => {
    const { admin, calls } = createAdmin();
    const outcome = await applyBulkCollectionEdit({
      admin: asAdmin(admin),
      shop: "s",
      collectionId: COLLECTION_ID,
      action: "add",
      rows: [row({ skipped: true, skipReason: "already_in", afterInCollection: false })],
    });

    expect(calls).toHaveLength(0);
    expect(outcome.succeeded).toBe(0);
    expect(outcome.failed).toBe(0);
  });
});

describe("applyBulkCollectionEdit（移出）", () => {
  const removeRow = (productId: string) =>
    row({ productId, beforeInCollection: true, afterInCollection: false });

  it("Job 已完成时直接返回成功，不再轮询", async () => {
    const { admin, calls } = createAdmin(() => ({
      data: {
        collectionRemoveProducts: { job: { id: "gid://shopify/Job/1", done: true }, userErrors: [] },
      },
    }));
    const outcome = await applyBulkCollectionEdit({
      admin: asAdmin(admin),
      shop: "s",
      collectionId: COLLECTION_ID,
      action: "remove",
      rows: [removeRow("gid://shopify/Product/1")],
    });

    expect(calls).toHaveLength(1);
    expect(outcome.succeeded).toBe(1);
    expect(outcome.pendingJob).toBeUndefined();
  });

  it("Job 轮询到完成后不标 pendingJob", async () => {
    let polls = 0;
    const { admin } = createAdmin((call) => {
      if (call.query.includes("collectionRemoveProducts")) {
        return {
          data: {
            collectionRemoveProducts: {
              job: { id: "gid://shopify/Job/1", done: false },
              userErrors: [],
            },
          },
        };
      }
      polls += 1;
      return { data: { job: { done: polls >= 2 } } };
    });
    const outcome = await applyBulkCollectionEdit({
      admin: asAdmin(admin),
      shop: "s",
      collectionId: COLLECTION_ID,
      action: "remove",
      rows: [removeRow("gid://shopify/Product/1")],
    });

    expect(polls).toBe(2);
    expect(outcome.succeeded).toBe(1);
    expect(outcome.pendingJob).toBeUndefined();
  });

  it("轮询预算用尽仍未完成时如实标 pendingJob", async () => {
    const { admin } = createAdmin((call) =>
      call.query.includes("collectionRemoveProducts")
        ? {
            data: {
              collectionRemoveProducts: {
                job: { id: "gid://shopify/Job/1", done: false },
                userErrors: [],
              },
            },
          }
        : { data: { job: { done: false } } },
    );
    const outcome = await applyBulkCollectionEdit({
      admin: asAdmin(admin),
      shop: "s",
      collectionId: COLLECTION_ID,
      action: "remove",
      rows: [removeRow("gid://shopify/Product/1")],
    });

    expect(outcome.pendingJob).toBe(true);
  }, 30000);

  it("提交失败时整批商品都记为失败", async () => {
    const { admin } = createAdmin(() => ({
      data: { collectionRemoveProducts: { userErrors: [{ message: "collection locked" }] } },
    }));
    const outcome = await applyBulkCollectionEdit({
      admin: asAdmin(admin),
      shop: "s",
      collectionId: COLLECTION_ID,
      action: "remove",
      rows: [removeRow("gid://shopify/Product/1"), removeRow("gid://shopify/Product/2")],
    });

    expect(outcome.succeeded).toBe(0);
    expect(outcome.failed).toBe(2);
    expect(outcome.errors[0].message).toContain("collection locked");
  });
});
