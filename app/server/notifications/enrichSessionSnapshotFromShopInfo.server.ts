import type { UninstallSessionSnapshot } from "../commonEventLog/loadSessionSnapshotForUninstall.server";
import { splitShopOwnerName } from "../session/syncSessionUserProfile.server";
import type { ShopBasicInfo } from "../shopify/fetchShopBasicInfo.server";

function resolveShopContactEmail(shopInfo: ShopBasicInfo): string | undefined {
  const contact = shopInfo.contactEmail?.trim();
  if (contact) return contact;
  const email = shopInfo.email?.trim();
  return email || undefined;
}

/**
 * Webhook 发信时用 Shopify 店铺信息补全 Session 快照（不覆盖已有非空字段）。
 */
export function enrichSessionSnapshotFromShopInfo(
  snapshot: UninstallSessionSnapshot | null,
  shopInfo: ShopBasicInfo | null,
  shop: string,
): UninstallSessionSnapshot | null {
  if (!shopInfo) return snapshot;

  const base: UninstallSessionSnapshot = snapshot ?? { shop };

  const email = base.email?.trim();
  const shopEmail = resolveShopContactEmail(shopInfo);
  const enrichedEmail = email || shopEmail;

  let firstName = base.firstName?.trim();
  let lastName = base.lastName?.trim();

  if (!firstName && shopInfo.ownerName?.trim()) {
    const split = splitShopOwnerName(shopInfo.ownerName);
    firstName = split.firstName;
    lastName = lastName || split.lastName;
  }

  if (
    enrichedEmail === base.email &&
    firstName === base.firstName &&
    lastName === base.lastName
  ) {
    return snapshot;
  }

  return {
    shop: base.shop,
    ...(enrichedEmail ? { email: enrichedEmail } : {}),
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    ...(base.locale ? { locale: base.locale } : {}),
  };
}
