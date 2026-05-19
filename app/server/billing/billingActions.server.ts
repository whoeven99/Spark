import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/tool";
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
  appName: string;
  planKey: string;
  request: Request;
}): Promise<{ confirmationUrl: string | null }> {
  const plan = await getPlanByKey(params.planKey);
  if (plan.appName !== params.appName) {
    throw new BillingError("套餐与当前 App 不匹配", BILLING_ERROR_CODE.PLAN_NOT_FOUND, 400);
  }
  if (plan.kind !== PLAN_CATALOG_KIND.SUBSCRIPTION) {
    throw new BillingError("该套餐不是订阅类型", BILLING_ERROR_CODE.INVALID_PLAN_KIND, 400);
  }

  const returnUrl = buildBillingReturnUrl(
    BILLING_PAGE_PATH,
    params.request,
    params.shop,
  );

  const gateway = getBillingGateway();
  const result = await gateway.createSubscription({
    admin: params.admin,
    shop: params.shop,
    appName: params.appName,
    plan: plan,
    returnUrl,
  });

  return { confirmationUrl: result.confirmationUrl };
}

export async function startTokenPackCheckout(params: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  appName: string;
  planKey: string;
  request: Request;
}): Promise<{ confirmationUrl: string | null }> {
  const plan = await getPlanByKey(params.planKey);
  if (plan.appName !== params.appName) {
    throw new BillingError("套餐与当前 App 不匹配", BILLING_ERROR_CODE.PLAN_NOT_FOUND, 400);
  }
  if (plan.kind !== PLAN_CATALOG_KIND.ONE_TIME_PACK) {
    throw new BillingError("该套餐不是按量购包", BILLING_ERROR_CODE.INVALID_PLAN_KIND, 400);
  }

  const returnUrl = buildBillingReturnUrl(
    BILLING_PAGE_PATH,
    params.request,
    params.shop,
  );

  const gateway = getBillingGateway();
  const result = await gateway.createOneTimePurchase({
    admin: params.admin,
    shop: params.shop,
    appName: params.appName,
    plan,
    returnUrl,
  });

  return { confirmationUrl: result.confirmationUrl };
}
