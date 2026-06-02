import { getAppEntry } from "../../../config/appEntry.server";
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

const LOG = "[Billing][TokenPackWebhook]";

export async function handleAppPurchaseOneTimeWebhook(params: {
  shop: string;
  payload: unknown;
  appName?: string;
}): Promise<void> {
  const appName = params.appName ?? getAppEntry();
  console.info(`${LOG} enter shop=${params.shop} appName=${appName}`);

  const purchase = parseOneTimePurchase(params.payload);
  if (!purchase?.admin_graphql_api_id) {
    console.warn(`${LOG} skip reason=missing-purchase-id`, params.payload);
    return;
  }

  const status = (purchase.status ?? "").toUpperCase();
  const purchaseId = purchase.admin_graphql_api_id;
  console.info(
    `${LOG} parsed shop=${params.shop} purchaseId=${purchaseId} status=${status || "(empty)"}`,
  );

  if (status !== "ACTIVE") {
    console.info(
      `${LOG} skip reason=status-not-active shop=${params.shop} status=${status || "(empty)"} purchaseId=${purchaseId}`,
    );
    return;
  }

  const pendingLog = await prisma.billingLog.findFirst({
    where: {
      shop: params.shop,
      appName,
      referenceId: purchaseId,
      eventType: "TOKEN_PACK_INITIATED",
    },
  });

  const planKey = pendingLog?.planKey ?? null;
  console.info(
    `${LOG} lookup-initiated-log shop=${params.shop} purchaseId=${purchaseId} found=${Boolean(pendingLog)} planKey=${planKey ?? "(none)"}`,
  );

  if (!planKey) {
    console.error(
      `${LOG} skip reason=missing-token-pack-initiated shop=${params.shop} appName=${appName} purchaseId=${purchaseId}`,
    );
    return;
  }

  const plan = await getPlanByKey(planKey);
  console.info(
    `${LOG} apply-token-pack shop=${params.shop} planKey=${planKey} tokens=${plan.tokens}`,
  );
  await applyTokenPackPurchase({
    shop: params.shop,
    appName,
    plan,
    shopifyPurchaseId: purchaseId,
    metadata: {
      webhookStatus: status,
    },
  });
  console.info(`${LOG} done shop=${params.shop} purchaseId=${purchaseId}`);
}
