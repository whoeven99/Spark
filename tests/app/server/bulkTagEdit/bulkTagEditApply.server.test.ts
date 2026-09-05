import { describe, expect, it, vi } from "vitest";
import {
  applyBulkTagEdit,
  buildBulkTagEditWritableRows,
} from "../../../../app/server/bulkTagEdit/bulkTagEditApply.server";
import type { BulkTagEditRow } from "../../../../app/lib/bulkTagEdit";

type GraphqlCall = { query: string; variables: Record<string, unknown> };

function row(overrides: Partial<BulkTagEditRow> = {}): BulkTagEditRow {
  return {
    productId: "gid://shopify/Product/1",
    productTitle: "商品",
    beforeTags: ["新品"],
    afterTags: ["新品", "夏季清仓"],
    addedTags: ["夏季清仓"],
    removedTags: [],
    skipped: false,
    ...overrides,
  };
}

/** 记录调用并按 mutation 名返回预设结果的假 admin。 */
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
  admin as unknown as Parameters<typeof applyBulkTagEdit>[0]["admin"];

describe("buildBulkTagEditWritableRows", () => {
  it("剔除跳过行与没有任何标签变更的行", () => {
    const rows = [
      row(),
      row({ productId: "gid://shopify/Product/2", skipped: true, skipReason: "no_change" }),
      row({ productId: "gid://shopify/Product/3", addedTags: [], removedTags: [] }),
    ];
    expect(buildBulkTagEditWritableRows(rows).map((r) => r.productId)).toEqual([
      "gid://shopify/Product/1",
    ]);
  });
});

describe("applyBulkTagEdit", () => {
  it("只加标签时只发一次 tagsAdd", async () => {
    const { admin, calls } = createAdmin();
    const outcome = await applyBulkTagEdit({ admin: asAdmin(admin), shop: "s", rows: [row()] });

    expect(calls).toHaveLength(1);
    expect(calls[0].query).toContain("tagsAdd");
    expect(calls[0].variables).toEqual({
      id: "gid://shopify/Product/1",
      tags: ["夏季清仓"],
    });
    expect(outcome.succeeded).toBe(1);
    expect(outcome.failed).toBe(0);
  });

  it("同时增删时先 tagsRemove 再 tagsAdd", async () => {
    const { admin, calls } = createAdmin();
    await applyBulkTagEdit({
      admin: asAdmin(admin),
      shop: "s",
      rows: [row({ addedTags: ["夏季清仓"], removedTags: ["新品"] })],
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].query).toContain("tagsRemove");
    expect(calls[1].query).toContain("tagsAdd");
  });

  it("移除失败时不再追加，避免留下半套状态", async () => {
    const { admin, calls } = createAdmin((call) =>
      call.query.includes("tagsRemove")
        ? { data: { tagsRemove: { userErrors: [{ message: "boom" }] } } }
        : { data: { tagsAdd: { userErrors: [] } } },
    );
    const outcome = await applyBulkTagEdit({
      admin: asAdmin(admin),
      shop: "s",
      rows: [row({ addedTags: ["夏季清仓"], removedTags: ["新品"] })],
    });

    expect(calls).toHaveLength(1);
    expect(outcome.succeeded).toBe(0);
    expect(outcome.failed).toBe(1);
    expect(outcome.errors[0]).toEqual({ productId: "gid://shopify/Product/1", message: "boom" });
  });

  it("单个商品失败不阻塞其它商品", async () => {
    const { admin } = createAdmin((call) =>
      call.variables.id === "gid://shopify/Product/2"
        ? { data: { tagsAdd: { userErrors: [{ message: "rate limited" }] } } }
        : { data: { tagsAdd: { userErrors: [] } } },
    );
    const outcome = await applyBulkTagEdit({
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
    const outcome = await applyBulkTagEdit({
      admin: asAdmin(admin),
      shop: "s",
      rows: [row({ skipped: true, skipReason: "no_change" })],
    });

    expect(calls).toHaveLength(0);
    expect(outcome.succeeded).toBe(0);
    expect(outcome.failed).toBe(0);
  });
});
