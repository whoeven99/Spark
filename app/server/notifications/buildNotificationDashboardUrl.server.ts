import {
  getAppEntry,
  getAppHomePath,
  isAppEntryKey,
  type AppEntry,
} from "../../config/appEntry.server";
import { buildShopifyAdminHostParam } from "../billing/buildBillingReturnUrl.server";

function resolveAppOrigin(): string | null {
  const configured = process.env.SHOPIFY_APP_URL?.trim();
  if (!configured) return null;
  const withProtocol = configured.startsWith("http")
    ? configured
    : `https://${configured}`;
  return new URL(withProtocol).origin;
}

export function buildNotificationDashboardUrl(
  shop: string,
  appKey?: string,
): string | undefined {
  const origin = resolveAppOrigin();
  if (!origin) return undefined;

  const entry: AppEntry = appKey && isAppEntryKey(appKey) ? appKey : getAppEntry();
  const home = getAppHomePath(entry);
  const url = new URL(home, origin);
  const normalizedShop = shop.trim();
  if (normalizedShop) {
    url.searchParams.set("shop", normalizedShop);
    url.searchParams.set("embedded", "1");
    url.searchParams.set("host", buildShopifyAdminHostParam(normalizedShop));
  }
  return url.toString();
}
