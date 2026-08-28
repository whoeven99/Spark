import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import prisma from "../../db.server";
import {
  BILLING_PAGE_PATH,
  buildBillingReturnUrl,
} from "./buildBillingReturnUrl.server";
import { BillingError, BILLING_ERROR_CODE } from "./errors.server";
import { getBillingGateway } from "./gateway/getBillingGateway.server";
import { getPlanByKey } from "./plans/planCatalog.server";
import { parseMoney } from "./overage/overageMath.server";
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

/**
 * 设置按需上限：
 * - 目标 ≤ Shopify 已授权 cappedAmount → 只改本地 overageSpendLimit（可下调）
 * - 目标 > Shopify 授权 → 走 Shopify 确认提高授权封顶
 */
export async function startRaiseOverageCap(params: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  cappedAmount: string;
}): Promise<{ confirmationUrl: string | null }> {
  const amount = Number.parseFloat(params.cappedAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new BillingError("超额上限无效", BILLING_ERROR_CODE.INVALID_PLAN_KIND, 400);
  }

  const sub = await prisma.appSubscription.findUnique({
    where: { shop: params.shop },
  });
  if (!sub?.usageLineItemId || !sub.overageEnabled) {
    throw new BillingError(
      "当前订阅未开通超额计费",
      BILLING_ERROR_CODE.INVALID_PLAN_KIND,
      400,
    );
  }

  const shopifyCap = parseMoney(sub.cappedAmount);
  const amountFixed = amount.toFixed(2);
  const currency = sub.cappedCurrency || "USD";

  // 不超过 Shopify 授权：本地即可（含下调、同额重开）
  if (Number.isFinite(shopifyCap) && amount <= shopifyCap + 1e-9) {
    await prisma.appSubscription.update({
      where: { shop: params.shop },
      data: {
        overageSpendLimit: amountFixed,
        overageSpendingEnabled: true,
      },
    });
    console.info(
      `[Billing][Checkout] set-local-spend-limit shop=${params.shop} amount=${amountFixed} shopifyCap=${shopifyCap}`,
    );
    return { confirmationUrl: null };
  }

  const gateway = getBillingGateway();
  if (!gateway.updateOverageCap) {
    throw new BillingError(
      "当前计费网关不支持调整超额上限",
      BILLING_ERROR_CODE.SHOPIFY_BILLING_FAILED,
      502,
    );
  }

  console.info(
    `[Billing][Checkout] raise-cap-start shop=${params.shop} amount=${amountFixed}`,
  );
  const result = await gateway.updateOverageCap({
    admin: params.admin,
    shop: params.shop,
    usageLineItemId: sub.usageLineItemId,
    cappedAmount: amountFixed,
    currencyCode: currency,
  });

  if (!result.confirmationUrl) {
    await prisma.appSubscription.update({
      where: { shop: params.shop },
      data: {
        cappedAmount: amountFixed,
        cappedCurrency: currency,
        overageSpendLimit: amountFixed,
        overageSpendingEnabled: true,
      },
    });
  } else {
    // 批准前先打开开关；授权封顶与 spendLimit 在确认后由回跳/webhook 同步
    await prisma.appSubscription.update({
      where: { shop: params.shop },
      data: { overageSpendingEnabled: true },
    });
  }

  return { confirmationUrl: result.confirmationUrl };
}

/** Disabled：本地关闭按需扣费（Shopify cappedAmount 不变，一分钱不扣） */
export async function setOverageSpendingDisabled(params: {
  shop: string;
}): Promise<void> {
  const sub = await prisma.appSubscription.findUnique({
    where: { shop: params.shop },
  });
  if (!sub?.usageLineItemId || !sub.overageEnabled) {
    throw new BillingError(
      "当前订阅未开通超额计费",
      BILLING_ERROR_CODE.INVALID_PLAN_KIND,
      400,
    );
  }

  await prisma.appSubscription.update({
    where: { shop: params.shop },
    data: {
      overageSpendingEnabled: false,
      // 丢弃尚未冲销的本地 pending，避免之后再开启时补扣
      overagePendingTokens: 0,
    },
  });
}
