import type { ShopifyAdminGraphqlClient } from "../../ai/skills/shopifyInfo/shopifyInfo.tool";
import prisma from "../../../db.server";
import { fetchShopBasicInfo } from "../../shopify/fetchShopBasicInfo.server";
import { BillingError } from "../errors.server";
import { normalizeReferralCode } from "./referralCodeFormat";
import { parseMyshopifyShopDomain } from "./shopHash.server";

export const DEV_STORE_REFERRAL_ERROR = {
  BLOCKED: "DEV_STORE_REFERRAL_BLOCKED",
} as const;

export const DEV_STORE_REFERRAL_BLOCKED_MESSAGE =
  "开发商店不能使用推荐码";

export function shouldBlockDevStoreReferral(input: {
  shopInfoOk: boolean;
  partnerDevelopment: boolean | null | undefined;
  allowlisted: boolean;
  shopDomainOk: boolean;
}): boolean {
  if (!input.shopInfoOk) return false;
  if (!input.partnerDevelopment) return false;
  if (!input.shopDomainOk) return true;
  return !input.allowlisted;
}

async function isShopAllowlisted(shop: string): Promise<boolean> {
  const row = await prisma.devStoreSubscribeAllowlist.findUnique({
    where: { shop },
    select: { id: true },
  });
  return Boolean(row);
}

export async function isDevStoreReferralBlocked(params: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
}): Promise<boolean> {
  let shopInfoOk = false;
  let partnerDevelopment: boolean | null | undefined;
  try {
    const info = await fetchShopBasicInfo(params.admin);
    shopInfoOk = Boolean(info);
    partnerDevelopment = info?.partnerDevelopment;
  } catch (error) {
    console.warn(
      `[Billing][DevStoreGate] shop-info-failed shop=${params.shop}`,
      error,
    );
    return false;
  }
  if (!shopInfoOk) {
    console.warn(
      `[Billing][DevStoreGate] shop-info-missing shop=${params.shop}`,
    );
    return false;
  }
  if (!partnerDevelopment) return false;

  const parsedShop = parseMyshopifyShopDomain(params.shop);
  const allowlisted = parsedShop ? await isShopAllowlisted(parsedShop) : false;
  const blocked = shouldBlockDevStoreReferral({
    shopInfoOk: true,
    partnerDevelopment,
    allowlisted,
    shopDomainOk: Boolean(parsedShop),
  });
  if (blocked) {
    console.info(
      `[Billing][DevStoreGate] referral-blocked shop=${params.shop} allowlisted=${allowlisted}`,
    );
  }
  return blocked;
}

/** 被禁开发店带码则抛错；无码返回空字符串以便清 pending 后继续普通订阅。 */
export async function resolveReferralCodeForCheckout(params: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
  rawCode: string;
}): Promise<string> {
  const blocked = await isDevStoreReferralBlocked({
    admin: params.admin,
    shop: params.shop,
  });
  const code = normalizeReferralCode(params.rawCode);
  if (blocked && code) {
    throw new BillingError(
      DEV_STORE_REFERRAL_BLOCKED_MESSAGE,
      DEV_STORE_REFERRAL_ERROR.BLOCKED,
      400,
    );
  }
  return blocked ? "" : params.rawCode;
}
