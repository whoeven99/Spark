import { getEnv } from "./env.js";
import { isProductionNodeEnv } from "./nodeEnv.js";

/** shopify.app.test.toml / shopify.app.prod.toml 的 client_id（可进仓库） */
export const SPARK_CLIENT_ID_TEST = "940b967eda872dd81f9ffc283e29a013";
export const SPARK_CLIENT_ID_PROD = "d68a7533dbbe676af335f27d01d87a12";

/**
 * Shopify 托管安装入口。
 * @see https://shopify.dev/docs/apps/build/authentication-authorization
 * 文档与 Partner 安装链为 `https://admin.shopify.com/oauth/install?client_id=`
 * 指定店时为 `https://admin.shopify.com/store/{store}/oauth/install?client_id=`
 */
export function resolveShopifyClientId(): string {
  const explicit = getEnv("SPARK_SHOPIFY_CLIENT_ID");
  if (explicit) return explicit;

  const dbUrl = getEnv("SPARK_DATABASE_URL").toLowerCase();
  if (dbUrl.includes("test")) return SPARK_CLIENT_ID_TEST;
  if (dbUrl.includes("prod")) return SPARK_CLIENT_ID_PROD;
  return isProductionNodeEnv() ? SPARK_CLIENT_ID_PROD : SPARK_CLIENT_ID_TEST;
}

export function buildReferralInstallUrl(_code?: string): string {
  const override = getEnv("SPARK_REFERRAL_LINK_BASE").replace(/\/$/, "");
  if (override) {
    const code = _code?.trim();
    return code ? `${override}/${encodeURIComponent(code)}` : override;
  }
  return `https://admin.shopify.com/oauth/install?client_id=${encodeURIComponent(resolveShopifyClientId())}`;
}
