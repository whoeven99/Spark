import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import prisma from "../../db.server";
import {
  BILLING_PAGE_PATH,
  buildBillingReturnUrl,
} from "./buildBillingReturnUrl.server";
import { BillingError, BILLING_ERROR_CODE } from "./errors.server";
import { getBillingGateway } from "./gateway/getBillingGateway.server";
import { getPlanByKey } from "./plans/planCatalog.server";
import { PLAN_CATALOG_KIND } from "./types.server";

export async function startSubscriptionCheckout(params: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  planKey: string;
  request: Request;
  trialDays?: number | null;
}): Promise<{ confirmationUrl: string | null }> {
  const plan = await getPlanByKey(params.planKey);
  if (plan.kind !== PLAN_CATALOG_KIND.SUBSCRIPTION) {
    throw new BillingError("该套餐不是订阅类型", BILLING_ERROR_CODE.INVALID_PLAN_KIND, 400);
  }

  const returnUrl = buildBillingReturnUrl(
    BILLING_PAGE_PATH,
    params.request,
    params.shop,
  );

  const gateway = getBillingGateway();
  console.info(
    `[Billing][Checkout] subscribe-start shop=${params.shop} planKey=${params.planKey}`,
  );
  const result = await gateway.createSubscription({
    admin: params.admin,
    shop: params.shop,
    plan: plan,
    returnUrl,
    trialDays: params.trialDays,
  });
  console.info(
    `[Billing][Checkout] subscribe-done shop=${params.shop} confirmationUrl=${result.confirmationUrl ? "set" : "null"} subscriptionId=${result.shopifySubscriptionId ?? "(none)"}`,
  );

  return { confirmationUrl: result.confirmationUrl };
}

export async function startTokenPackCheckout(params: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  planKey: string;
  request: Request;
}): Promise<{ confirmationUrl: string | null }> {
  const plan = await getPlanByKey(params.planKey);
  if (plan.kind !== PLAN_CATALOG_KIND.ONE_TIME_PACK) {
    throw new BillingError("该套餐不是按量购包", BILLING_ERROR_CODE.INVALID_PLAN_KIND, 400);
  }

  const returnUrl = buildBillingReturnUrl(
    BILLING_PAGE_PATH,
    params.request,
    params.shop,
  );

  const gateway = getBillingGateway();
  console.info(
    `[Billing][Checkout] token-pack-start shop=${params.shop} planKey=${params.planKey}`,
  );
  const result = await gateway.createOneTimePurchase({
    admin: params.admin,
    shop: params.shop,
    plan,
    returnUrl,
  });
  console.info(
    `[Billing][Checkout] token-pack-done shop=${params.shop} confirmationUrl=${result.confirmationUrl ? "set" : "null"} purchaseId=${result.shopifyPurchaseId ?? "(none)"}`,
  );

  return { confirmationUrl: result.confirmationUrl };
}

export async function startRaiseOverageCap(params: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  cappedAmount: string;
}): Promise<{ confirmationUrl: string | null }> {
  const amount = Number.parseFloat(params.cappedAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new BillingError('超额上限无效', BILLING_ERROR_CODE.INVALID_PLAN_KIND, 400);
  }

  const sub = await prisma.appSubscription.findUnique({
    where: { shop: params.shop },
  });
  if (!sub?.usageLineItemId || !sub.overageEnabled) {
    throw new BillingError(
      '当前订阅未开通超额计费',
      BILLING_ERROR_CODE.INVALID_PLAN_KIND,
      400,
    );
  }

  const currentCap = Number.parseFloat(sub.cappedAmount ?? '0');
  if (Number.isFinite(currentCap) && amount <= currentCap) {
    throw new BillingError(
      '新的超额上限必须高于当前上限',
      BILLING_ERROR_CODE.INVALID_PLAN_KIND,
      400,
    );
  }

  const gateway = getBillingGateway();
  if (!gateway.updateOverageCap) {
    throw new BillingError(
      '当前计费网关不支持调整超额上限',
      BILLING_ERROR_CODE.SHOPIFY_BILLING_FAILED,
      502,
    );
  }

  const currency = sub.cappedCurrency || 'USD';
  console.info(
    `[Billing][Checkout] raise-cap-start shop=${params.shop} amount=${amount}`,
  );
  const result = await gateway.updateOverageCap({
    admin: params.admin,
    shop: params.shop,
    usageLineItemId: sub.usageLineItemId,
    cappedAmount: amount.toFixed(2),
    currencyCode: currency,
  });

  if (!result.confirmationUrl) {
    await prisma.appSubscription.update({
      where: { shop: params.shop },
      data: {
        cappedAmount: amount.toFixed(2),
        cappedCurrency: currency,
      },
    });
  }

  return { confirmationUrl: result.confirmationUrl };
}
