import {
  buildMetaAppsecretProof,
  requestBusinessManagerAccessToken,
} from "./metaCapiTokenLegacy.server";

export { buildMetaAppsecretProof };

/**
 * 旧版自动换取 CAPI token（仅 FBE Business Manager access_token 捷径）。
 * 新商户应使用 Facebook Login for Business（BISU）onboarding。
 */
export async function fetchMetaPixelCapiAccessToken(params: {
  shop: string;
  pixelId: string;
  businessId: string;
  oauthAccessToken: string;
  appId: string;
  appSecret: string;
  apiVersion?: string;
}): Promise<string> {
  const shop = params.shop.trim().toLowerCase();
  const pixelId = params.pixelId.trim();
  const businessId = params.businessId.trim();
  const oauthAccessToken = params.oauthAccessToken.trim();
  const appId = params.appId.trim();
  const appSecret = params.appSecret.trim();

  if (!shop || !pixelId || !businessId || !oauthAccessToken || !appId || !appSecret) {
    throw new Error("自动获取 CAPI Token 缺少必要参数");
  }

  const businessToken = await requestBusinessManagerAccessToken({
    businessId,
    shop,
    pixelId,
    oauthAccessToken,
    appId,
    appSecret,
    apiVersion: params.apiVersion,
  });
  if (businessToken) return businessToken;

  throw new Error(
    "无法自动获取 CAPI Access Token。请使用「连接 Facebook CAPI」完成 Business Login 授权，或在 Events Manager 手动粘贴 Token。",
  );
}
