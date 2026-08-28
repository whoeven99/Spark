import prisma from "../../../db.server";
import { APP_SUBSCRIPTION_STATUS } from "../types.server";

export const PENDING_PLAN_CHANGE_CLEAR = {
  pendingShopifySubscriptionId: null,
  pendingPlanKey: null,
  pendingConfirmationUrl: null,
  pendingCreatedAt: null,
} as const;

export async function clearPendingPlanChange(shop: string): Promise<boolean> {
  const sub = await prisma.appSubscription.findUnique({ where: { shop } });
  if (!sub?.pendingShopifySubscriptionId) return false;

  await prisma.appSubscription.update({
    where: { id: sub.id },
    data: { ...PENDING_PLAN_CHANGE_CLEAR },
  });
  return true;
}

/**
 * 商家拒绝扣款：清换套餐 pending，或删除从未激活的首次 PENDING 行（不扣额度）。
 */
export async function handleDeclinedSubscriptionCheckout(params: {
  shop: string;
  shopifySubscriptionId: string;
}): Promise<"cleared_pending" | "cleared_first" | "noop"> {
  const sub = await prisma.appSubscription.findUnique({
    where: { shop: params.shop },
  });
  if (!sub) return "noop";

  if (sub.pendingShopifySubscriptionId === params.shopifySubscriptionId) {
    await prisma.appSubscription.update({
      where: { id: sub.id },
      data: { ...PENDING_PLAN_CHANGE_CLEAR },
    });
    return "cleared_pending";
  }

  const isFirstPending =
    sub.status === APP_SUBSCRIPTION_STATUS.PENDING &&
    sub.shopifySubscriptionId === params.shopifySubscriptionId &&
    !sub.pendingShopifySubscriptionId;

  if (isFirstPending) {
    await prisma.accountPeriodUsage.deleteMany({
      where: { appSubscriptionId: sub.id },
    });
    await prisma.appSubscription.delete({ where: { id: sub.id } });
    return "cleared_first";
  }

  return "noop";
}
