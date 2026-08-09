/**
 * Google Ads OAuth access token 刷新与 API 调用前凭证准备。
 * 供 Ads Insights、Metrics、Ads Create 等模块复用。
 */

import {
  getGoogleAdsCredential,
  setGoogleAdsCredential,
  type GoogleAdsCredential,
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

/** access token 到期前这段时间内就提前刷新，避免请求途中过期。 */
const ACCESS_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

/** login-customer-id 探测结果的有效期，过期后重新探测以跟上权限变更。 */
const LOGIN_CUSTOMER_ID_TTL_MS = 24 * 60 * 60 * 1000;

/** 已知过期时刻且尚未进入提前刷新窗口时，当前 access token 仍可直接使用。 */
function isAccessTokenUsable(expiresAt: string | undefined, now: number): boolean {
  if (!expiresAt) return false;
  const expiry = Date.parse(expiresAt);
  if (Number.isNaN(expiry)) return false;
  return now + ACCESS_TOKEN_REFRESH_SKEW_MS < expiry;
}

/** 带校验戳且未超过有效期的 login-customer-id 可信，无需再探测。 */
function isLoginCustomerIdVerified(verifiedAt: string | undefined, now: number): boolean {
  if (!verifiedAt) return false;
  const stamped = Date.parse(verifiedAt);
  if (Number.isNaN(stamped)) return false;
  return now - stamped < LOGIN_CUSTOMER_ID_TTL_MS;
}

/**
 * 解析并缓存 login-customer-id。
 *
 * 历史凭证常把子账户自身写成 login，会导致 USER_PERMISSION_DENIED，因此只信任
 * 由本函数探测过、带 `loginCustomerIdVerifiedAt` 戳且未过期的值；其余情况一律重新探测。
 */
export async function resolveVerifiedLoginCustomerId(params: {
  shop: string;
  cred: GoogleAdsCredential;
  accessToken: string;
  developerToken: string;
}): Promise<string> {
  const { shop, cred, accessToken, developerToken } = params;
  const stored = cred.loginCustomerId?.trim() || "";
  if (stored && isLoginCustomerIdVerified(cred.loginCustomerIdVerifiedAt, Date.now())) {
    return stored;
  }

  const resolved = await resolveLoginCustomerId({
    accessToken,
    developerToken,
    customerId: cred.customerId,
    accessibleCustomerIds: stored ? [stored, cred.customerId] : [cred.customerId],
  });

  // 不传 accessTokenExpiresAt：accessToken 未变，交给存储层沿用刷新流程写下的过期时刻。
  await setGoogleAdsCredential(shop, {
    accessToken,
    refreshToken: cred.refreshToken,
    customerId: cred.customerId,
    loginCustomerId: resolved,
    loginCustomerIdVerifiedAt: new Date().toISOString(),
  });
  if (resolved !== stored) {
    console.info(
      `${LOG_PREFIX} step=update_login_customer_id shop=${shop} customerId=${normalizeCustomerId(cred.customerId)} loginCustomerId=${resolved}`,
    );
  }
  return resolved;
}

/** 使用 refresh token 换取新的 access token，并写回凭证存储。 */
export async function maybeRefreshGoogleAdsToken(shop: string): Promise<string | null> {
  const cred = await getGoogleAdsCredential(shop);
  if (!cred?.refreshToken) return cred?.accessToken ?? null;

  // 已知过期时刻且还没临近过期时，直接复用，省掉一次 token 端点往返与一次写库。
  if (isAccessTokenUsable(cred.accessTokenExpiresAt, Date.now())) {
    return cred.accessToken;
  }

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
    accessTokenExpiresAt: new Date(
      Date.now() + refreshed.expiresIn * 1000,
    ).toISOString(),
    customerId: cred.customerId,
    loginCustomerId: cred.loginCustomerId,
    // login 未变，显式带上校验戳，避免刷新 token 时把探测结果清掉。
    loginCustomerIdVerifiedAt: cred.loginCustomerIdVerifiedAt,
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

  // 刷新流程本身已写回新 token，这里不再重复写库。
  const accessToken = (await maybeRefreshGoogleAdsToken(shop)) ?? cred.accessToken;
  const loginCustomerId = await resolveVerifiedLoginCustomerId({
    shop,
    cred,
    accessToken,
    developerToken,
  });

  return {
    accessToken,
    customerId: cred.customerId,
    loginCustomerId,
  };
}
