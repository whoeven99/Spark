import { describe, expect, it, vi } from "vitest";
import {
  applyBulkSeoEdit,
  buildBulkSeoEditWritableRows,
  buildSeoInput,
} from "../../../../app/server/bulkSeoEdit/bulkSeoEditApply.server";
import type { BulkSeoEditRow } from "../../../../app/lib/bulkSeoEdit";

type GraphqlCall = { query: string; variables: Record<string, unknown> };

function row(overrides: Partial<BulkSeoEditRow> = {}): BulkSeoEditRow {
  return {
    productId: "gid://shopify/Product/1",
    productTitle: "商品",
    beforeSeoTitle: null,
    afterSeoTitle: "新标题",
    beforeSeoDescription: null,
    afterSeoDescription: null,
    titleChanged: true,
    descriptionChanged: false,
    skipped: false,
    ...overrides,
  };
}

function createAdmin(handler: (call: GraphqlCall) => unknown = () => ({ data: {} })): {
  admin: { graphql: ReturnType<typeof vi.fn> };
  calls: GraphqlCall[];
} {
  const calls: GraphqlCall[] = [];
  const graphql = vi.fn(async (query: string, init?: { variables?: Record<string, unknown> }) => {
    const call = { query, variables: init?.variables ?? {} };
    calls.push(call);
    return { ok: true, status: 200, json: async () => handler(call) };
  });
  return { admin: { graphql }, calls };
}

const asAdmin = (admin: { graphql: ReturnType<typeof vi.fn> }) =>
  admin as unknown as Parameters<typeof applyBulkSeoEdit>[0]["admin"];

describe("buildBulkSeoEditWritableRows", () => {
  it("剔除跳过行与没有任何字段变更的行", () => {
    const rows = [
      row(),
      row({ productId: "gid://shopify/Product/2", skipped: true, skipReason: "no_change" }),
      row({
        productId: "gid://shopify/Product/3",
        titleChanged: false,
        descriptionChanged: false,
      }),
    ];
    expect(buildBulkSeoEditWritableRows(rows).map((r) => r.productId)).toEqual([
      "gid://shopify/Product/1",
    ]);
  });
});

describe("buildSeoInput", () => {
  it("只带本次变化的子字段，避免覆盖另一半", () => {
    expect(buildSeoInput(row())).toEqual({
      id: "gid://shopify/Product/1",
      seo: { title: "新标题" },
    });
  });

  it("两个字段都变时一起写入", () => {
    const input = buildSeoInput(
      row({ descriptionChanged: true, afterSeoDescription: "新描述" }),
    );
    expect(input.seo).toEqual({ title: "新标题", description: "新描述" });
  });

  it("只改描述时不带 title", () => {
    const input = buildSeoInput(
      row({
        titleChanged: false,
        afterSeoTitle: "不该被写入",
        descriptionChanged: true,
        afterSeoDescription: "新描述",
      }),
    );
    expect(input.seo).toEqual({ description: "新描述" });
  });
});

describe("applyBulkSeoEdit", () => {
  it("每个商品发一次 productUpdate 并统计成功数", async () => {
    const { admin, calls } = createAdmin();
    const outcome = await applyBulkSeoEdit({
      admin: asAdmin(admin),
      shop: "demo.myshopify.com",
      rows: [row(), row({ productId: "gid://shopify/Product/2" })],
    });
    expect(calls).toHaveLength(2);
    expect(calls[0].query).toContain("productUpdate");
    expect(outcome).toMatchObject({ succeeded: 2, failed: 0 });
    expect(outcome.errors).toEqual([]);
  });

  it("userErrors 记为失败但不阻塞其它商品", async () => {
    const { admin } = createAdmin((call) => {
      const input = call.variables.input as { id: string };
      if (input.id === "gid://shopify/Product/1") {
        return { data: { productUpdate: { userErrors: [{ message: "SEO title invalid" }] } } };
      }
      return { data: { productUpdate: { product: { id: input.id }, userErrors: [] } } };
    });

    const outcome = await applyBulkSeoEdit({
      admin: asAdmin(admin),
      shop: "demo.myshopify.com",
      rows: [row(), row({ productId: "gid://shopify/Product/2" })],
    });
    expect(outcome.succeeded).toBe(1);
    expect(outcome.failed).toBe(1);
    expect(outcome.errors[0]).toEqual({
      productId: "gid://shopify/Product/1",
      message: "SEO title invalid",
    });
  });

  it("没有可写回的行时不发任何请求", async () => {
    const { admin, calls } = createAdmin();
    const outcome = await applyBulkSeoEdit({
      admin: asAdmin(admin),
      shop: "demo.myshopify.com",
      rows: [row({ skipped: true, skipReason: "no_change" })],
    });
    expect(calls).toHaveLength(0);
    expect(outcome).toMatchObject({ succeeded: 0, failed: 0 });
  });
});
