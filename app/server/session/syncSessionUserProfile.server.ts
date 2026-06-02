import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/tool";
import prisma from "../../db.server";
import { fetchShopBasicInfo } from "../shopify/fetchShopBasicInfo.server";

const LOG = "[SessionSync]";

/** "John Doe" → { firstName: "John", lastName: "Doe" }；单段名无 lastName。 */
export function splitShopOwnerName(full: string): {
  firstName: string;
  lastName?: string;
} {
  const trimmed = full.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: trimmed };
  }
  const firstName = parts[0]!;
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : undefined;
  return lastName ? { firstName, lastName } : { firstName };
}

function resolveShopContactEmail(shopInfo: {
  contactEmail?: string;
  email?: string;
}): string | undefined {
  const contact = shopInfo.contactEmail?.trim();
  if (contact) return contact;
  const email = shopInfo.email?.trim();
  return email || undefined;
}

/**
 * 将 online session 的用户字段（firstName/lastName/email/locale）
 * 同步到同一 shop 的 offline session。
 *
 * Shopify SDK 在 OAuth 后仅向 online session 写入 staff member 信息，
 * offline session 通常为空；`loadSessionSnapshotForUninstall` 查询时优先 offline，
 * 导致邮件收件人姓名/地址为空。
 *
 * 规则：只写 online session 中有值的字段（始终覆盖，保持数据最新）。
 * 失败只 console.warn，不阻断调用方。
 */
export async function syncSessionUserProfileFromOnline(session: {
  id: string;
  shop: string;
  isOnline: boolean;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  locale?: string | null;
}): Promise<void> {
  if (!session.isOnline) return;

  const firstName = session.firstName?.trim() || null;
  const lastName = session.lastName?.trim() || null;
  const email = session.email?.trim() || null;
  const locale = session.locale?.trim() || null;

  if (!firstName && !email) return;

  try {
    const updateData: Record<string, string | null> = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (email) updateData.email = email;
    if (locale) updateData.locale = locale;

    const updated = await prisma.session.updateMany({
      where: { shop: session.shop, isOnline: false },
      data: updateData,
    });

    if (updated.count > 0) {
      console.info(
        `${LOG} synced user profile to offline session shop=${session.shop} fields=${Object.keys(updateData).join(",")}`,
      );
    }
  } catch (error) {
    console.warn(`${LOG} failed to sync session user profile shop=${session.shop}:`, error);
  }
}

/**
 * 每次进 App / OAuth 后从 Shopify 拉取店铺资料，写入 offline Session。
 * email / shopOwnerName / firstName / lastName 有值则覆盖；shopName 同次请求一并更新。
 */
export async function syncSessionShopProfile(
  shop: string,
  admin: ShopifyAdminGraphqlClient,
): Promise<void> {
  try {
    const shopInfo = await fetchShopBasicInfo(admin);
    if (!shopInfo?.name) {
      console.warn(`${LOG} sync shop profile skipped shop=${shop} reason=missing-shop-name`);
      return;
    }

    const updateData: Record<string, string | null> = { shopName: shopInfo.name };

    const shopEmail = resolveShopContactEmail(shopInfo);
    if (shopEmail) updateData.email = shopEmail;

    const ownerName = shopInfo.ownerName?.trim();
    if (ownerName) {
      updateData.shopOwnerName = ownerName;
      const { firstName, lastName } = splitShopOwnerName(ownerName);
      updateData.firstName = firstName;
      updateData.lastName = lastName ?? null;
    }

    const updated = await prisma.session.updateMany({
      where: { shop, isOnline: false },
      data: updateData,
    });

    if (updated.count > 0) {
      console.info(
        `${LOG} synced shop profile to offline session shop=${shop} fields=${Object.keys(updateData).join(",")}`,
      );
    }
  } catch (error) {
    console.warn(`${LOG} failed to sync shop profile shop=${shop}:`, error);
  }
}

/** @deprecated 使用 syncSessionShopProfile */
export const syncSessionShopName = syncSessionShopProfile;
