import type { AppEntry } from "../../config/appEntry.server";

/** 需要校验订阅 / token 的 App（主 App 暂不启用）。 */
export const BILLING_ENABLED_APPS = new Set<AppEntry>(["generate-description"]);

export function isBillingEnabledForApp(appName: string): boolean {
  return BILLING_ENABLED_APPS.has(appName as AppEntry);
}

export function isBillingTestMode(): boolean {
  return (
    process.env.BILLING_TEST?.trim() === "true" ||
    process.env.NODE_ENV !== "production"
  );
}

export function useNoopBillingGateway(): boolean {
  return process.env.BILLING_GATEWAY?.trim().toLowerCase() === "noop";
}

/**
 * 非生产计费测试时展示「取消订阅」按钮。
 * Render Test 通常 `NODE_ENV=production`，需设 `BILLING_TEST=true`（与 Shopify 测试计费一致）。
 */
export function isBillingDevCancelEnabled(): boolean {
  if (process.env.BILLING_DEV_CANCEL?.trim() === "false") {
    return false;
  }
  if (process.env.BILLING_DEV_CANCEL?.trim() === "true") {
    return true;
  }
  return (
    process.env.NODE_ENV?.trim() === "test" || isBillingTestMode()
  );
}
