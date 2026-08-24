/**
 * 兼容旧 App URL 前缀：`/app/product-improve/webhooks/...`
 * 必须用 `app_` 逃出 `app.tsx` 布局，否则会走 authenticate.admin，HMAC webhook 会失败。
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  canonicalPathFromLegacyProductImproveSplat,
  isShopifyWebhookPath,
} from "../server/webhook/legacyProductImprovePrefix.server";
import { action as appUninstalledAction } from "./webhooks.app.uninstalled";
import { action as appScopesUpdateAction } from "./webhooks.app.scopes_update";
import { action as appSubscriptionsUpdateAction } from "./webhooks.app.subscriptions_update";
import { action as appPurchasesOneTimeUpdateAction } from "./webhooks.app.purchases_one_time_update";
import { action as ordersPaidAction } from "./webhooks.orders.paid";
import { action as ordersCancelledAction } from "./webhooks.orders.cancelled";
import { action as refundsCreateAction } from "./webhooks.refunds.create";
import { action as inventoryLevelsUpdateAction } from "./webhooks.inventory_levels.update";
import { action as fulfillmentsCreateAction } from "./webhooks.fulfillments.create";
import { action as fulfillmentsUpdateAction } from "./webhooks.fulfillments.update";
import {
  action as metaCatalogAction,
  loader as metaCatalogLoader,
} from "./webhooks.meta.catalog";
import { action as gmcProductStatusAction } from "./webhooks.google-merchant.product-status";

type WebhookAction = (
  args: ActionFunctionArgs,
) => ReturnType<typeof appUninstalledAction> | ReturnType<typeof metaCatalogAction>;

const WEBHOOK_ACTIONS: Record<string, WebhookAction> = {
  "/webhooks/app/uninstalled": appUninstalledAction,
  "/webhooks/app/scopes_update": appScopesUpdateAction,
  "/webhooks/app/subscriptions_update": appSubscriptionsUpdateAction,
  "/webhooks/app/purchases_one_time_update": appPurchasesOneTimeUpdateAction,
  "/webhooks/orders/paid": ordersPaidAction,
  "/webhooks/orders/cancelled": ordersCancelledAction,
  "/webhooks/refunds/create": refundsCreateAction,
  "/webhooks/inventory_levels/update": inventoryLevelsUpdateAction,
  "/webhooks/fulfillments/create": fulfillmentsCreateAction,
  "/webhooks/fulfillments/update": fulfillmentsUpdateAction,
  "/webhooks/meta/catalog": metaCatalogAction,
  "/webhooks/google-merchant/product-status": gmcProductStatusAction,
};

function resolveLegacyWebhookPath(
  splat: string | undefined,
): string | null {
  const canonical = canonicalPathFromLegacyProductImproveSplat(splat);
  if (!canonical || !isShopifyWebhookPath(canonical)) return null;
  return canonical;
}

export const action = async (args: ActionFunctionArgs) => {
  const canonical = resolveLegacyWebhookPath(args.params["*"]);
  const handler = canonical ? WEBHOOK_ACTIONS[canonical] : undefined;
  if (!handler) {
    return new Response("Not Found", { status: 404 });
  }
  return handler(args);
};

export const loader = async (args: LoaderFunctionArgs) => {
  const canonical = resolveLegacyWebhookPath(args.params["*"]);
  if (canonical === "/webhooks/meta/catalog") {
    return metaCatalogLoader(args);
  }
  return new Response("Not Found", { status: 404 });
};
