import { merchantFriendlyJson } from "../http/merchantFriendlyResponse.server";
import { BillingAccessDeniedError, BILLING_ERROR_CODE } from "./errors.server";
import { loadBillingContext, type BillingContext } from "./billingContext.server";
import { ensureInstallPromoTokens } from "./promo/promoCampaign.server";

export async function requireBillingAccess(shop: string): Promise<BillingContext> {
  // 兜底：壳层未跑完或只打 API 时也能自动领安装福利
  await ensureInstallPromoTokens(shop);
  const ctx = await loadBillingContext(shop);

  if (!ctx.hasAccess) {
    const code =
      ctx.denialReason === "overage_cap_reached"
        ? BILLING_ERROR_CODE.OVERAGE_CAP_REACHED
        : BILLING_ERROR_CODE.QUOTA_EXHAUSTED;
    const message =
      ctx.denialReason === "overage_cap_reached"
        ? "含内 Token 与按需上限都已用完，请前往账户页提高按需上限或升级套餐。"
        : "Token 余额不足或尚未订阅，请前往账户页开通";
    throw new BillingAccessDeniedError(
      message,
      {
        shop,
        availableTokens: ctx.availableTokens,
        usedTokens: ctx.usedTokens,
        subscriptionStatus: ctx.subscription?.status ?? null,
        denialReason: ctx.denialReason,
      },
      code,
    );
  }

  return ctx;
}

export function billingErrorToResponse(error: unknown): Response | null {
  if (error instanceof BillingAccessDeniedError) {
    return merchantFriendlyJson({
      success: false,
      errorCode: error.code,
      errorMsg: error.message,
      billing: error.details ?? {},
    });
  }
  return null;
}
