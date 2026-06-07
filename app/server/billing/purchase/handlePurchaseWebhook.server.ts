import prisma from "../../../db.server";
import { getPlanByKey } from "../plans/planCatalog.server";
import { applyTokenPackPurchase } from "./applyTokenPack.server";

type WebhookOneTimePurchase = {
  admin_graphql_api_id?: string;
  status?: string;
};

function parseOneTimePurchase(payload: unknown): WebhookOneTimePurchase | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const purchase =
    root.app_purchase_one_time ??
    root["appPurchaseOneTime"] ??
    root.purchase;
  if (!purchase || typeof purchase !== "object") return null;
  return purchase as WebhookOneTimePurchase;
}

export async function handleAppPurchaseOneTimeWebhook(params: {
  shop: string;
  payload: unknown;
}): Promise<void> {
  const purchase = parseOneTimePurchase(params.payload);
  if (!purchase?.admin_graphql_api_id) {
    console.warn("[Billing] one-time purchase webhook missing id", params.payload);
    return;
  }

  const status = (purchase.status ?? "").toUpperCase();
  if (status !== "ACTIVE") return;

  const purchaseId = purchase.admin_graphql_api_id;

  const pendingLog = await prisma.billingLog.findFirst({
    where: {
      shop: params.shop,
      referenceId: purchaseId,
      eventType: "TOKEN_PACK_INITIATED",
    },
  });

  const planKey = pendingLog?.planKey ?? null;

  if (!planKey) {
    console.warn("[Billing] one-time purchase missing planKey", purchaseId);
    return;
  }

  const plan = await getPlanByKey(planKey);
  await applyTokenPackPurchase({
    shop: params.shop,
    plan,
    shopifyPurchaseId: purchaseId,
    metadata: {
      webhookStatus: status,
    },
  });
}
