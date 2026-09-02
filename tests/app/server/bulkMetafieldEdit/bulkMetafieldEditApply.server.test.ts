import { describe, expect, it, vi } from "vitest";
import {
  applyBulkMetafieldEdit,
  selectWritableMetafieldRows,
  type BulkMetafieldEditApplyContext,
} from "../../../../app/server/bulkMetafieldEdit/bulkMetafieldEditApply.server";
import type { BulkMetafieldEditRow } from "../../../../app/lib/bulkMetafieldEdit";

type GraphqlCall = { query: string; variables: Record<string, unknown> };

const SET_CONTEXT: BulkMetafieldEditApplyContext = {
  action: "set",
  namespace: "custom",
  key: "material",
  type: "single_line_text_field",
};

const CLEAR_CONTEXT: BulkMetafieldEditApplyContext = { ...SET_CONTEXT, action: "clear" };

function row(overrides: Partial<BulkMetafieldEditRow> = {}): BulkMetafieldEditRow {
  return {
    productId: "gid://shopify/Product/1",
    productTitle: "商品",
    beforeValue: null,
    afterValue: "纯棉",
    skipped: false,
    ...overrides,
  };
}

function rows(count: number, afterValue = "纯棉"): BulkMetafieldEditRow[] {
  return Array.from({ length: count }, (_, index) =>
    row({ productId: `gid://shopify/Product/${index + 1}`, afterValue }),
  );
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
  admin as unknown as Parameters<typeof applyBulkMetafieldEdit>[0]["admin"];

const inputsOf = (call: GraphqlCall) =>
  call.variables.metafields as Array<Record<string, unknown>>;

describe("selectWritableMetafieldRows", () => {
  it("设值时剔除跳过行与没有目标值的行", () => {
    const candidates = [
      row(),
      row({ productId: "gid://shopify/Product/2", skipped: true, skipReason: "no_change" }),
      row({ productId: "gid://shopify/Product/3", afterValue: null }),
      row({ productId: "gid://shopify/Product/4", afterValue: "  " }),
    ];
    expect(selectWritableMetafieldRows(candidates, "set").map((r) => r.productId)).toEqual([
      "gid://shopify/Product/1",
    ]);
  });

  it("清空时不要求目标值，只看有没有被跳过", () => {
    const candidates = [
      row({ afterValue: null }),
      row({ productId: "gid://shopify/Product/2", skipped: true, skipReason: "nothing_to_clear" }),
    ];
    expect(selectWritableMetafieldRows(candidates, "clear").map((r) => r.productId)).toEqual([
      "gid://shopify/Product/1",
    ]);
  });
});

describe("applyBulkMetafieldEdit（设值）", () => {
  it("按 25 条一批提交，并显式带上 namespace / key / type", async () => {
    const { admin, calls } = createAdmin(() => ({
      data: { metafieldsSet: { userErrors: [] } },
    }));

    const outcome = await applyBulkMetafieldEdit({
      admin: asAdmin(admin),
      shop: "demo.myshopify.com",
      context: SET_CONTEXT,
      rows: rows(30),
    });

    expect(outcome).toMatchObject({ succeeded: 30, failed: 0, errors: [] });
    // Shopify 对 metafieldsSet 的硬上限是 25，30 行必须切成两批
    expect(calls).toHaveLength(2);
    expect(inputsOf(calls[0])).toHaveLength(25);
    expect(inputsOf(calls[1])).toHaveLength(5);
    expect(inputsOf(calls[0])[0]).toEqual({
      ownerId: "gid://shopify/Product/1",
      namespace: "custom",
      key: "material",
      type: "single_line_text_field",
      value: "纯棉",
    });
  });

  it("整批原子失败时按 elementIndex 剔掉坏行再重发，好行不陪葬", async () => {
    let call = 0;
    const { admin, calls } = createAdmin(() => {
      call += 1;
      if (call === 1) {
        return {
          data: {
            metafieldsSet: {
              userErrors: [{ message: "值太长", code: "TOO_LONG", elementIndex: 1 }],
            },
          },
        };
      }
      return { data: { metafieldsSet: { userErrors: [] } } };
    });

    const outcome = await applyBulkMetafieldEdit({
      admin: asAdmin(admin),
      shop: "demo.myshopify.com",
      context: SET_CONTEXT,
      rows: rows(3),
    });

    expect(outcome).toMatchObject({ succeeded: 2, failed: 1 });
    expect(outcome.errors).toEqual([
      { productId: "gid://shopify/Product/2", message: "值太长" },
    ]);
    // 第二次只重发剩下两行，不是退化成逐行调用
    expect(calls).toHaveLength(2);
    expect(inputsOf(calls[1]).map((i) => i.ownerId)).toEqual([
      "gid://shopify/Product/1",
      "gid://shopify/Product/3",
    ]);
  });

  it("拿不到 elementIndex 时退化成逐行重发来归因", async () => {
    let call = 0;
    const { admin, calls } = createAdmin(() => {
      call += 1;
      if (call === 1) {
        return { data: { metafieldsSet: { userErrors: [{ message: "批量失败" }] } } };
      }
      // 逐行重发时只有第二行真的写不进去
      const owner = String(inputsOf(calls[call - 1])[0].ownerId);
      return owner === "gid://shopify/Product/2"
        ? { data: { metafieldsSet: { userErrors: [{ message: "值非法" }] } } }
        : { data: { metafieldsSet: { userErrors: [] } } };
    });

    const outcome = await applyBulkMetafieldEdit({
      admin: asAdmin(admin),
      shop: "demo.myshopify.com",
      context: SET_CONTEXT,
      rows: rows(3),
    });

    expect(calls).toHaveLength(4);
    expect(outcome).toMatchObject({ succeeded: 2, failed: 1 });
    expect(outcome.errors[0].productId).toBe("gid://shopify/Product/2");
  });

  it("传输层错误归到整批，不谎报成功", async () => {
    const graphql = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    const outcome = await applyBulkMetafieldEdit({
      admin: asAdmin({ graphql } as never),
      shop: "demo.myshopify.com",
      context: SET_CONTEXT,
      rows: rows(1),
    });
    expect(outcome).toMatchObject({ succeeded: 0, failed: 1 });
    expect(outcome.errors[0].message).toContain("503");
  });
});

describe("applyBulkMetafieldEdit（清空）", () => {
  it("发 metafieldsDelete，只带 ownerId / namespace / key", async () => {
    const { admin, calls } = createAdmin(() => ({
      data: { metafieldsDelete: { deletedMetafields: [], userErrors: [] } },
    }));

    const outcome = await applyBulkMetafieldEdit({
      admin: asAdmin(admin),
      shop: "demo.myshopify.com",
      context: CLEAR_CONTEXT,
      rows: rows(2, "").map((r) => ({ ...r, beforeValue: "涤纶", afterValue: null })),
    });

    expect(outcome).toMatchObject({ succeeded: 2, failed: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0].query).toContain("metafieldsDelete");
    expect(inputsOf(calls[0])[0]).toEqual({
      ownerId: "gid://shopify/Product/1",
      namespace: "custom",
      key: "material",
    });
  });

  it("字段本来就不存在（deletedMetafields 返回 null）算成功", async () => {
    const { admin } = createAdmin(() => ({
      data: { metafieldsDelete: { deletedMetafields: [null], userErrors: [] } },
    }));
    const outcome = await applyBulkMetafieldEdit({
      admin: asAdmin(admin),
      shop: "demo.myshopify.com",
      context: CLEAR_CONTEXT,
      rows: [row({ beforeValue: "涤纶", afterValue: null })],
    });
    expect(outcome).toMatchObject({ succeeded: 1, failed: 0 });
  });

  it("整批失败时逐行重试归因（delete 的 userErrors 没有下标）", async () => {
    let call = 0;
    const { admin, calls } = createAdmin(() => {
      call += 1;
      if (call === 1) {
        return { data: { metafieldsDelete: { userErrors: [{ message: "批量失败" }] } } };
      }
      const owner = String(inputsOf(calls[call - 1])[0].ownerId);
      return owner === "gid://shopify/Product/3"
        ? { data: { metafieldsDelete: { userErrors: [{ message: "无权删除" }] } } }
        : { data: { metafieldsDelete: { userErrors: [] } } };
    });

    const outcome = await applyBulkMetafieldEdit({
      admin: asAdmin(admin),
      shop: "demo.myshopify.com",
      context: CLEAR_CONTEXT,
      rows: rows(3).map((r) => ({ ...r, beforeValue: "涤纶", afterValue: null })),
    });

    expect(calls).toHaveLength(4);
    expect(outcome).toMatchObject({ succeeded: 2, failed: 1 });
    expect(outcome.errors[0]).toEqual({
      productId: "gid://shopify/Product/3",
      message: "无权删除",
    });
  });
});
