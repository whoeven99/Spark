import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { backfillOrders } from "../server/shopify/sync/backfill.server";
import type { BackfillResult } from "../server/shopify/sync/types";

// 内部开发路由：无导航入口，仅用于历史订单回补（/app/backfill）。

const SYNC_RESOURCES = ["orders"] as const;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const checkpoints = await prisma.shopSyncCheckpoint.findMany({
    where: { shop },
    orderBy: { resource: "asc" },
  });

  const orderCount = await prisma.shopOrder.count({ where: { shop } });
  const customerCount = await prisma.shopCustomer.count({ where: { shop } });
  const inventoryCount = await prisma.shopInventoryLevel.count({ where: { shop } });
  const fulfillmentCount = await prisma.shopFulfillment.count({ where: { shop } });

  return {
    shop,
    checkpoints: checkpoints.map((c) => ({
      resource: c.resource,
      lastSyncedAt: c.lastSyncedAt.toISOString(),
      lastCursor: c.lastCursor,
    })),
    counts: { orderCount, customerCount, inventoryCount, fulfillmentCount },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const shop = session.shop;

  const form = await request.formData();
  const resource = form.get("resource") as string;
  const daysBack = parseInt(form.get("daysBack") as string, 10) || 90;

  if (!SYNC_RESOURCES.includes(resource as (typeof SYNC_RESOURCES)[number])) {
    return { error: `Unknown resource: ${resource}`, result: null };
  }

  let result: BackfillResult;
  try {
    result = await backfillOrders(shop, admin, { daysBack });
  } catch (error) {
    console.error(`[Backfill] action failed resource=${resource}:`, error);
    return { error: String(error), result: null };
  }

  return { error: null, result };
};

export default function BackfillPage() {
  const { shop, checkpoints, counts } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const findCheckpoint = (resource: string) =>
    checkpoints.find((c) => c.resource === resource);

  return (
    <div style={{ maxWidth: 640, margin: "40px auto", fontFamily: "sans-serif", padding: "0 20px" }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>历史数据回补</h1>
      <p style={{ color: "#666", marginBottom: 24, fontSize: 14 }}>
        Shop: <code>{shop}</code>
      </p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>当前同步状态</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f5f5f5", textAlign: "left" }}>
              <th style={{ padding: "8px 12px" }}>资源</th>
              <th style={{ padding: "8px 12px" }}>记录数</th>
              <th style={{ padding: "8px 12px" }}>最后同步</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: "8px 12px", borderTop: "1px solid #eee" }}>orders</td>
              <td style={{ padding: "8px 12px", borderTop: "1px solid #eee" }}>{counts.orderCount}</td>
              <td style={{ padding: "8px 12px", borderTop: "1px solid #eee" }}>
                {findCheckpoint("orders")?.lastSyncedAt
                  ? new Date(findCheckpoint("orders")!.lastSyncedAt).toLocaleString("zh-CN")
                  : "—"}
              </td>
            </tr>
            <tr>
              <td style={{ padding: "8px 12px", borderTop: "1px solid #eee" }}>customers</td>
              <td style={{ padding: "8px 12px", borderTop: "1px solid #eee" }}>{counts.customerCount}</td>
              <td style={{ padding: "8px 12px", borderTop: "1px solid #eee" }}>随订单同步</td>
            </tr>
            <tr>
              <td style={{ padding: "8px 12px", borderTop: "1px solid #eee" }}>inventory</td>
              <td style={{ padding: "8px 12px", borderTop: "1px solid #eee" }}>{counts.inventoryCount}</td>
              <td style={{ padding: "8px 12px", borderTop: "1px solid #eee" }}>实时 Webhook</td>
            </tr>
            <tr>
              <td style={{ padding: "8px 12px", borderTop: "1px solid #eee" }}>fulfillments</td>
              <td style={{ padding: "8px 12px", borderTop: "1px solid #eee" }}>{counts.fulfillmentCount}</td>
              <td style={{ padding: "8px 12px", borderTop: "1px solid #eee" }}>随订单同步</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>触发回补</h2>
        <Form method="post">
          <input type="hidden" name="resource" value="orders" />
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
            <label style={{ fontSize: 13 }}>
              回溯天数：
              <input
                name="daysBack"
                type="number"
                defaultValue={90}
                min={1}
                max={365}
                style={{
                  marginLeft: 8,
                  padding: "4px 8px",
                  border: "1px solid #ddd",
                  borderRadius: 4,
                  width: 80,
                }}
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              padding: "8px 20px",
              background: isSubmitting ? "#999" : "#1890ff",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: isSubmitting ? "not-allowed" : "pointer",
              fontSize: 13,
            }}
          >
            {isSubmitting ? "同步中..." : "回补订单（含客户/退款）"}
          </button>
        </Form>
      </section>

      {actionData && (
        <section>
          {actionData.error ? (
            <div
              style={{
                padding: "12px 16px",
                background: "#fff2f0",
                border: "1px solid #ffa39e",
                borderRadius: 4,
                fontSize: 13,
                color: "#cf1322",
              }}
            >
              错误：{actionData.error}
            </div>
          ) : actionData.result ? (
            <div
              style={{
                padding: "12px 16px",
                background: "#f6ffed",
                border: "1px solid #b7eb8f",
                borderRadius: 4,
                fontSize: 13,
              }}
            >
              <strong>回补完成</strong>
              <ul style={{ margin: "8px 0 0 0", paddingLeft: 20 }}>
                <li>同步成功：{actionData.result.synced} 条</li>
                <li>跳过：{actionData.result.skipped} 条</li>
                <li>错误：{actionData.result.errors} 条</li>
              </ul>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
