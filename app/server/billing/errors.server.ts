export const BILLING_ERROR_CODE = {
  BILLING_REQUIRED: "BILLING_REQUIRED",
  PLAN_NOT_FOUND: "PLAN_NOT_FOUND",
  INVALID_PLAN_KIND: "INVALID_PLAN_KIND",
  SHOPIFY_BILLING_FAILED: "SHOPIFY_BILLING_FAILED",
  TRIAL_DAILY_LIMIT_EXCEEDED: "TRIAL_DAILY_LIMIT_EXCEEDED",
} as const;

export class BillingError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 402,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BillingError";
  }
}

export class BillingAccessDeniedError extends BillingError {
  constructor(
    message = "需要订阅或购买 token 后才能继续使用",
    details?: Record<string, unknown>,
  ) {
    super(message, BILLING_ERROR_CODE.BILLING_REQUIRED, 402, details);
    this.name = "BillingAccessDeniedError";
  }
}

export class TrialDailyLimitError extends BillingError {
  constructor(dailyLimit: number, used: number) {
    super(
      `试用期每日积分上限为 ${dailyLimit.toLocaleString()}，今日已使用 ${used.toLocaleString()}，请明日再试或直接订阅以解除限制`,
      BILLING_ERROR_CODE.TRIAL_DAILY_LIMIT_EXCEEDED,
      429,
    );
    this.name = "TrialDailyLimitError";
  }
}
