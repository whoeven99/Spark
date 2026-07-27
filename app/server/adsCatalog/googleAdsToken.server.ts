/**
 * Google Ads OAuth access token 刷新与 API 调用前凭证准备。
 * 供 Ads Insights、Metrics、Ads Create 等模块复用。
 */

import {
  getGoogleAdsCredential,
  setGoogleAdsCredential,
} from "./credentialStore.server";
import { refreshGoogleAccessToken } from "./clients/googleMerchantClient.server";
import {
  normalizeCustomerId,
  resolveLoginCustomerId,
} from "./googleAdsApi.server";
import {
  getGoogleAdsDeveloperToken,
  getGoogleOAuthClient,
} from "./googleOAuth.server";

const LOG_PREFIX = "[AdsCatalog][GoogleAdsToken]";

/** 使用 refresh token 换取新的 access token，并写回凭证存储。 */
export async function maybeRefreshGoogleAdsToken(shop: string): Promise<string | null> {
  const cred = await getGoogleAdsCredential(shop);
  if (!cred?.refreshToken) return cred?.accessToken ?? null;

  const { clientId, clientSecret } = getGoogleOAuthClient();
  if (!clientId || !clientSecret) {
    console.warn(
      `${LOG_PREFIX} step=refresh_token shop=${shop} skipped=missing_oauth_client using_stored_access_token`,
    );
    return cred.accessToken;
  }

  const refreshed = await refreshGoogleAccessToken({
    clientId,
    clientSecret,
    refreshToken: cred.refreshToken,
  });
  if (!refreshed) {
    console.warn(
      `${LOG_PREFIX} step=refresh_token shop=${shop} customerId=${cred.customerId} result=failed using_stored_access_token`,
    );
    return cred.accessToken;
  }

  await setGoogleAdsCredential(shop, {
    accessToken: refreshed.accessToken,
    refreshToken: cred.refreshToken,
    customerId: cred.customerId,
    loginCustomerId: cred.loginCustomerId,
  });
  return refreshed.accessToken;
}

export type GoogleAdsApiAuth = {
  accessToken: string;
  customerId: string;
  loginCustomerId: string;
};

/**
 * 创建/查询 Google Ads API 前的凭证准备：刷新 token + 解析 login-customer-id。
 */
export async function prepareGoogleAdsApiAuth(shop: string): Promise<GoogleAdsApiAuth> {
  const cred = await getGoogleAdsCredential(shop);
  if (!cred) {
    throw new Error("Google Ads 账户未连接，请前往 Ads Catalog 授权");
  }

  const developerToken = getGoogleAdsDeveloperToken();
  if (!developerToken) {
    throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN 环境变量未配置");
  }

  const accessToken = (await maybeRefreshGoogleAdsToken(shop)) ?? cred.accessToken;
  const loginCustomerId = await resolveLoginCustomerId({
    accessToken,
    developerToken,
    customerId: cred.customerId,
    accessibleCustomerIds: cred.loginCustomerId
      ? [cred.loginCustomerId, cred.customerId]
      : [cred.customerId],
  });

  if (
    loginCustomerId !== (cred.loginCustomerId?.trim() || "") ||
    accessToken !== cred.accessToken
  ) {
    await setGoogleAdsCredential(shop, {
      accessToken,
      refreshToken: cred.refreshToken,
      customerId: cred.customerId,
      loginCustomerId,
    });
    console.info(
      `${LOG_PREFIX} step=update_credential shop=${shop} customerId=${normalizeCustomerId(cred.customerId)} loginCustomerId=${loginCustomerId}`,
    );
  }

  return {
    accessToken,
    customerId: cred.customerId,
    loginCustomerId,
  };
}
