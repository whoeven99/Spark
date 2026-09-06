import { describe, expect, it, vi } from "vitest";
import {
  applyBulkStatusEdit,
  buildBulkStatusEditWritableRows,
} from "../../../../app/server/bulkStatusEdit/bulkStatusEditApply.server";
import type { BulkStatusEditRow } from "../../../../app/lib/bulkStatusEdit";

type GraphqlCall = { query: string; variables: Record<string, unknown> };

function row(overrides: Partial<BulkStatusEditRow> = {}): BulkStatusEditRow {
  return {
    productId: "gid://shopify/Product/1",
    productTitle: "商品",
    beforeStatus: "DRAFT",
    afterStatus: "ACTIVE",
    totalInventory: 3,
    tracksInventory: true,
    needsPublishCheck: false,
    skipped: false,
    ...overrides,
  };
}

/** 记录调用并按变量返回预设结果的假 admin。 */
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
  admin as unknown as Parameters<typeof applyBulkStatusEdit>[0]["admin"];

describe("buildBulkStatusEditWritableRows", () => {
  it("剔除跳过行、前后同状态的行与非法目标状态", () => {
    const rows = [
      row(),
      row({ productId: "gid://shopify/Product/2", skipped: true, skipReason: "no_change" }),
      row({ productId: "gid://shopify/Product/3", beforeStatus: "ACTIVE" }),
      row({ productId: "gid://shopify/Product/4", afterStatus: "ARCHIVED" }),
    ];
    expect(buildBulkStatusEditWritableRows(rows).map((r) => r.productId)).toEqual([
      "gid://shopify/Product/1",
    ]);
  });
});

describe("applyBulkStatusEdit", () => {
  it("按新签名只传 id 与 status", async () => {
    const { admin, calls } = createAdmin();
    const outcome = await applyBulkStatusEdit({ admin: asAdmin(admin), shop: "s", rows: [row()] });

    expect(calls).toHaveLength(1);
    expect(calls[0].query).toContain("ProductUpdateInput");
    expect(calls[0].variables).toEqual({
      product: { id: "gid://shopify/Product/1", status: "ACTIVE" },
    });
    expect(outcome.succeeded).toBe(1);
    expect(outcome.failed).toBe(0);
  });

  it("userErrors 记为失败行", async () => {
    const { admin } = createAdmin(() => ({
      data: { productUpdate: { userErrors: [{ message: "boom" }] } },
    }));
    const outcome = await applyBulkStatusEdit({ admin: asAdmin(admin), shop: "s", rows: [row()] });

    expect(outcome.succeeded).toBe(0);
    expect(outcome.failed).toBe(1);
    expect(outcome.errors[0]).toEqual({ productId: "gid://shopify/Product/1", message: "boom" });
  });

  it("单个商品失败不阻塞其它商品", async () => {
    const { admin } = createAdmin((call) => {
      const product = call.variables.product as { id: string };
      return product.id === "gid://shopify/Product/2"
        ? { data: { productUpdate: { userErrors: [{ message: "rate limited" }] } } }
        : { data: { productUpdate: { userErrors: [] } } };
    });
    const outcome = await applyBulkStatusEdit({
      admin: asAdmin(admin),
      shop: "s",
      rows: [
        row(),
        row({ productId: "gid://shopify/Product/2" }),
        row({ productId: "gid://shopify/Product/3" }),
      ],
    });

    expect(outcome.succeeded).toBe(2);
    expect(outcome.failed).toBe(1);
    expect(outcome.errors[0].productId).toBe("gid://shopify/Product/2");
  });

  it("跳过行不会产生任何 mutation", async () => {
    const { admin, calls } = createAdmin();
    const outcome = await applyBulkStatusEdit({
      admin: asAdmin(admin),
      shop: "s",
      rows: [row({ skipped: true, skipReason: "no_change" })],
    });

    expect(calls).toHaveLength(0);
    expect(outcome.succeeded).toBe(0);
    expect(outcome.failed).toBe(0);
  });
});
