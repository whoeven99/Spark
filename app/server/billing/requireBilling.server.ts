import { BillingAccessDeniedError, TrialDailyLimitError, BILLING_ERROR_CODE } from "./errors.server";
import { loadBillingContext, type BillingContext } from "./billingContext.server";

export async function requireBillingAccess(shop: string): Promise<BillingContext> {
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
    return Response.json(
      {
        success: false,
        errorCode: error.code,
        errorMsg: error.message,
        billing: error.details ?? {},
      },
      { status: error.status },
    );
  }
  if (error instanceof TrialDailyLimitError) {
    return Response.json(
      { success: false, errorCode: error.code, errorMsg: error.message, billing: {} },
      { status: error.status },
    );
  }
  return null;
}
