import type { ShopifyAdminGraphqlClient } from "../../ai/skills/shopifyInfo/shopifyInfo.tool";
import { isProductionNodeEnv } from "../../../config/nodeEnv.server";
import prisma from "../../../db.server";
import { fetchShopBasicInfo } from "../../shopify/fetchShopBasicInfo.server";
import { BillingError } from "../errors.server";
import { parseMyshopifyShopDomain } from "./shopHash.server";

export const DEV_STORE_SUBSCRIBE_ERROR = {
  BLOCKED: "DEV_STORE_SUBSCRIBE_BLOCKED",
} as const;

export const DEV_STORE_SUBSCRIBE_BLOCKED_MESSAGE =
  "开发商店无法在此环境订阅。如需测试请联系我们把店铺加入白名单。";

export function shouldBlockDevStoreSubscribe(input: {
  isProduction: boolean;
  shopInfoOk: boolean;
  partnerDevelopment: boolean | null | undefined;
  allowlisted: boolean;
  shopDomainOk: boolean;
}): boolean {
  if (!input.isProduction) return false;
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

export async function isDevStoreSubscribeBlocked(params: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
}): Promise<boolean> {
  if (!isProductionNodeEnv()) return false;

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
  const blocked = shouldBlockDevStoreSubscribe({
    isProduction: true,
    shopInfoOk: true,
    partnerDevelopment,
    allowlisted,
    shopDomainOk: Boolean(parsedShop),
  });
  if (blocked) {
    console.info(
      `[Billing][DevStoreGate] blocked shop=${params.shop} allowlisted=${allowlisted}`,
    );
  }
  return blocked;
}

export async function assertDevStoreCanSubscribe(params: {
  admin: ShopifyAdminGraphqlClient;
  shop: string;
}): Promise<void> {
  const blocked = await isDevStoreSubscribeBlocked(params);
  if (!blocked) return;
  throw new BillingError(
    DEV_STORE_SUBSCRIBE_BLOCKED_MESSAGE,
    DEV_STORE_SUBSCRIBE_ERROR.BLOCKED,
    400,
  );
}
