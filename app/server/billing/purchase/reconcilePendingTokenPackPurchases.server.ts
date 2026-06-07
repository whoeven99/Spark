import type { ShopifyAdminGraphqlClient } from "../../ai/skills/shopifyInfo/tool";
import prisma from "../../../db.server";
import { useNoopBillingGateway } from "../constants.server";
import {
  shopifyFetchAppPurchaseOneTime,
  toAppPurchaseOneTimeGid,
} from "../gateway/shopifyGraphqlBilling.server";
import { getPlanByKey } from "../plans/planCatalog.server";
import { BILLING_LOG_EVENT } from "../types.server";
import { applyTokenPackPurchase } from "./applyTokenPack.server";

/**
 * Shopify 购包批准后若 webhook 未到（常见于 test.toml 未注册 billing webhook），
 * 在计费页 loader 用 Admin API 核对 INITIATED 订单并补入账。
 */
export async function reconcilePendingTokenPackPurchases(params: {
  shop: string;
  admin: ShopifyAdminGraphqlClient;
  chargeId?: string | null;
}): Promise<void> {
  if (useNoopBillingGateway()) return;

  const purchaseId = params.chargeId
    ? toAppPurchaseOneTimeGid(params.chargeId)
    : null;

  const initiatedRows = await prisma.billingLog.findMany({
    where: {
      shop: params.shop,
      eventType: BILLING_LOG_EVENT.TOKEN_PACK_INITIATED,
      ...(purchaseId ? { referenceId: purchaseId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: purchaseId ? 3 : 10,
  });

  for (const row of initiatedRows) {
    if (!row.referenceId || !row.planKey) continue;

    const purchased = await prisma.billingLog.findFirst({
      where: {
        shop: params.shop,
        eventType: BILLING_LOG_EVENT.TOKEN_PACK_PURCHASED,
        referenceId: row.referenceId,
      },
    });
    if (purchased) continue;

    try {
      const node = await shopifyFetchAppPurchaseOneTime(
        params.admin,
        row.referenceId,
      );
      if (!node || node.status.toUpperCase() !== "ACTIVE") continue;

      const plan = await getPlanByKey(row.planKey);
      await applyTokenPackPurchase({
        shop: params.shop,
        plan,
        shopifyPurchaseId: row.referenceId,
        metadata: {
          reconciledOnBillingPage: true,
          shopifyStatus: node.status,
        },
      });
      console.info(
        `[Billing] reconciled token pack shop=${params.shop} purchase=${row.referenceId} plan=${row.planKey}`,
      );
    } catch (error) {
      console.error(
        `[Billing] reconcile token pack failed shop=${params.shop} purchase=${row.referenceId}:`,
        error,
      );
    }
  }
}
