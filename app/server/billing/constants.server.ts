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
