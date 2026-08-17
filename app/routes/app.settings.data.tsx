import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import {
  PageHeaderNav,
  PageSectionHeader,
  PageSurface,
  mobilePageContentStyle,
  pageColorTokens,
  pageContentStyle,
} from "./page/pageUiStyles";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { backfillOrders } from "../server/shopify/sync/backfill.server";
import type { BackfillResult } from "../server/shopify/sync/types";

// 历史订单回补工具（新 IA 下归入设置 › 数据工具，/app/settings/data）。

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
  const { isMobile } = useResponsiveLayout();
  const { shop, checkpoints, counts } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const findCheckpoint = (resource: string) =>
    checkpoints.find((c) => c.resource === resource);

  const summaryItems = [
    {
      label: "订单",
      value: counts.orderCount,
      note: findCheckpoint("orders")?.lastSyncedAt
        ? new Date(findCheckpoint("orders")!.lastSyncedAt).toLocaleString("zh-CN")
        : "尚未同步",
    },
    {
      label: "客户",
      value: counts.customerCount,
      note: "随订单同步",
    },
    {
      label: "库存",
      value: counts.inventoryCount,
      note: "实时 Webhook",
    },
    {
      label: "履约",
      value: counts.fulfillmentCount,
      note: "随订单同步",
    },
  ];

  return (
    <div
      style={{
        ...pageContentStyle,
        ...(isMobile ? mobilePageContentStyle : null),
        maxWidth: 720,
      }}
    >
      <PageHeaderNav
        title="历史数据回补"
        subtitle={`把 Shopify 历史订单补齐到本地镜像。当前店铺：${shop}`}
        backLabel="返回设置"
        fallbackPath="/app/settings"
      />

      <PageSurface>
        <PageSectionHeader
          title="当前同步状态"
          subtitle="先确认本地镜像里已经有哪些数据，再决定是否需要做历史回补。"
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
            gap: "0.75rem",
          }}
        >
          {summaryItems.map((item) => (
            <div
              key={item.label}
              style={{
                border: `1px solid ${pageColorTokens.borderSubtle}`,
                borderRadius: pageColorTokens.radiusControl,
                background: pageColorTokens.surfaceMuted,
                padding: "0.9rem 1rem",
                display: "grid",
                gap: "0.2rem",
              }}
            >
              <span style={{ fontSize: "0.78rem", color: pageColorTokens.textSecondary }}>
                {item.label}
              </span>
              <strong style={{ fontSize: "1.15rem", color: pageColorTokens.textPrimary }}>
                {item.value}
              </strong>
              <span style={{ fontSize: "0.78rem", color: pageColorTokens.textSecondary }}>
                {item.note}
              </span>
            </div>
          ))}
        </div>
        <div style={{ width: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 480 }}>
            <thead>
              <tr
                style={{
                  background: pageColorTokens.surfaceMuted,
                  textAlign: "left",
                  color: pageColorTokens.textSecondary,
                }}
              >
                <th style={{ padding: "10px 12px" }}>资源</th>
                <th style={{ padding: "10px 12px" }}>记录数</th>
                <th style={{ padding: "10px 12px" }}>最后同步</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: "10px 12px", borderTop: `1px solid ${pageColorTokens.borderSubtle}` }}>
                  orders
                </td>
                <td style={{ padding: "10px 12px", borderTop: `1px solid ${pageColorTokens.borderSubtle}` }}>
                  {counts.orderCount}
                </td>
                <td style={{ padding: "10px 12px", borderTop: `1px solid ${pageColorTokens.borderSubtle}` }}>
                  {findCheckpoint("orders")?.lastSyncedAt
                    ? new Date(findCheckpoint("orders")!.lastSyncedAt).toLocaleString("zh-CN")
                    : "—"}
                </td>
              </tr>
              <tr>
                <td style={{ padding: "10px 12px", borderTop: `1px solid ${pageColorTokens.borderSubtle}` }}>
                  customers
                </td>
                <td style={{ padding: "10px 12px", borderTop: `1px solid ${pageColorTokens.borderSubtle}` }}>
                  {counts.customerCount}
                </td>
                <td style={{ padding: "10px 12px", borderTop: `1px solid ${pageColorTokens.borderSubtle}` }}>
                  随订单同步
                </td>
              </tr>
              <tr>
                <td style={{ padding: "10px 12px", borderTop: `1px solid ${pageColorTokens.borderSubtle}` }}>
                  inventory
                </td>
                <td style={{ padding: "10px 12px", borderTop: `1px solid ${pageColorTokens.borderSubtle}` }}>
                  {counts.inventoryCount}
                </td>
                <td style={{ padding: "10px 12px", borderTop: `1px solid ${pageColorTokens.borderSubtle}` }}>
                  实时 Webhook
                </td>
              </tr>
              <tr>
                <td style={{ padding: "10px 12px", borderTop: `1px solid ${pageColorTokens.borderSubtle}` }}>
                  fulfillments
                </td>
                <td style={{ padding: "10px 12px", borderTop: `1px solid ${pageColorTokens.borderSubtle}` }}>
                  {counts.fulfillmentCount}
                </td>
                <td style={{ padding: "10px 12px", borderTop: `1px solid ${pageColorTokens.borderSubtle}` }}>
                  随订单同步
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </PageSurface>

      <PageSurface>
        <PageSectionHeader
          title="触发回补"
          subtitle="适用于首次接入或历史数据缺失场景。会补齐订单，并带上客户与退款数据。"
        />
        <Form method="post" style={{ display: "grid", gap: "1rem" }}>
          <input type="hidden" name="resource" value="orders" />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 220px) 1fr",
              gap: "0.75rem",
              alignItems: "end",
            }}
          >
            <label style={{ display: "grid", gap: "0.35rem", fontSize: 13 }}>
              <span style={{ color: pageColorTokens.textSecondary }}>回溯天数</span>
              <input
                name="daysBack"
                type="number"
                defaultValue={90}
                min={1}
                max={365}
                style={{
                  padding: "0.65rem 0.8rem",
                  border: `1px solid ${pageColorTokens.border}`,
                  borderRadius: pageColorTokens.radiusControl,
                  width: "100%",
                  boxSizing: "border-box",
                  fontSize: 14,
                }}
              />
            </label>
            <div
              style={{
                fontSize: "0.82rem",
                color: pageColorTokens.textSecondary,
                lineHeight: 1.5,
              }}
            >
              默认回补近 90 天订单；如果是首次同步老店铺，可以按需要扩展到更长时间窗口。
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: "0.7rem 1.1rem",
                background: isSubmitting ? "#9aa5b1" : pageColorTokens.brandBlue,
                color: "#fff",
                border: "none",
                borderRadius: pageColorTokens.radiusControl,
                cursor: isSubmitting ? "not-allowed" : "pointer",
                fontSize: 13,
                width: isMobile ? "100%" : "auto",
                minWidth: isMobile ? "100%" : 220,
              }}
            >
              {isSubmitting ? "同步中..." : "回补订单（含客户/退款）"}
            </button>
          </div>
        </Form>
      </PageSurface>

      {actionData && (
        <PageSurface>
          {actionData.error ? (
            <div
              style={{
                padding: "12px 16px",
                background: "#fff2f0",
                border: "1px solid #ffa39e",
                borderRadius: pageColorTokens.radiusControl,
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
                borderRadius: pageColorTokens.radiusControl,
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
        </PageSurface>
      )}
    </div>
  );
}
