import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useTranslation } from "react-i18next";
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
  const { t, i18n } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const { shop, checkpoints, counts } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const findCheckpoint = (resource: string) =>
    checkpoints.find((c) => c.resource === resource);

  const formatDateTime = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));

  const summaryItems = [
    {
      label: t("settingsData.summaryOrders"),
      value: counts.orderCount,
      note: findCheckpoint("orders")?.lastSyncedAt
        ? formatDateTime(findCheckpoint("orders")!.lastSyncedAt)
        : t("settingsData.notSynced"),
    },
    {
      label: t("settingsData.summaryCustomers"),
      value: counts.customerCount,
      note: t("settingsData.syncWithOrders"),
    },
    {
      label: t("settingsData.summaryInventory"),
      value: counts.inventoryCount,
      note: t("settingsData.realtimeWebhook"),
    },
    {
      label: t("settingsData.summaryFulfillments"),
      value: counts.fulfillmentCount,
      note: t("settingsData.syncWithOrders"),
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
        title={t("settingsData.pageTitle")}
        subtitle={t("settingsData.pageSubtitle", { shop })}
        backLabel={t("settingsShell.back")}
        fallbackPath="/app/settings"
      />

      <PageSurface>
        <PageSectionHeader
          title={t("settingsData.statusTitle")}
          subtitle={t("settingsData.statusSubtitle")}
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
                <th style={{ padding: "10px 12px" }}>{t("settingsData.tableResource")}</th>
                <th style={{ padding: "10px 12px" }}>{t("settingsData.tableCount")}</th>
                <th style={{ padding: "10px 12px" }}>{t("settingsData.tableLastSynced")}</th>
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
                    ? formatDateTime(findCheckpoint("orders")!.lastSyncedAt)
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
                  {t("settingsData.syncWithOrders")}
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
                  {t("settingsData.realtimeWebhook")}
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
                  {t("settingsData.syncWithOrders")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </PageSurface>

      <PageSurface>
        <PageSectionHeader
          title={t("settingsData.triggerTitle")}
          subtitle={t("settingsData.triggerSubtitle")}
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
              <span style={{ color: pageColorTokens.textSecondary }}>
                {t("settingsData.daysBackLabel")}
              </span>
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
              {t("settingsData.daysBackHint")}
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
              {isSubmitting
                ? t("settingsData.submitting")
                : t("settingsData.submitAction")}
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
              {t("settingsData.errorPrefix")}: {actionData.error}
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
              <strong>{t("settingsData.successTitle")}</strong>
              <ul style={{ margin: "8px 0 0 0", paddingLeft: 20 }}>
                <li>{t("settingsData.successSynced", { count: actionData.result.synced })}</li>
                <li>{t("settingsData.successSkipped", { count: actionData.result.skipped })}</li>
                <li>{t("settingsData.successErrors", { count: actionData.result.errors })}</li>
              </ul>
            </div>
          ) : null}
        </PageSurface>
      )}
    </div>
  );
}
