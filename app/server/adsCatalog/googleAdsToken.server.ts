/**
 * Google Ads OAuth access token 刷新与 API 调用前凭证准备。
 * 供 Ads Insights、Metrics、Ads Create 等模块复用。
 */

import {
  getGoogleAdsCredential,
  getGoogleMerchantCredential,
  setGoogleAdsCredential,
  type GoogleAdsCredential,
} from "./credentialStore.server";
import {
  isGoogleOAuthRefreshAuthError,
  refreshGoogleAccessTokenDetailed,
} from "./clients/googleMerchantClient.server";
import {
  normalizeCustomerId,
  resolveLoginCustomerId,
} from "./googleAdsApi.server";
import {
  getGoogleAdsDeveloperToken,
  getGoogleOAuthClient,
} from "./googleOAuth.server";

const LOG_PREFIX = "[AdsCatalog][GoogleAdsToken]";

export const GOOGLE_ADS_REAUTH_REQUIRED_MESSAGE =
  "Google Ads 授权已失效，请前往广告连接页断开 Google Ads 并重新授权。";

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

/** login 校验戳必须同时匹配当前 customerId，避免换账户后复用旧 login。 */
function isGoogleAdsLoginBindingTrusted(
  cred: Pick<
    GoogleAdsCredential,
    | "customerId"
    | "loginCustomerId"
    | "loginCustomerIdVerifiedAt"
    | "loginCustomerIdVerifiedForCustomerId"
  >,
  now: number,
): boolean {
  const stored = cred.loginCustomerId?.trim();
  if (!stored || !isLoginCustomerIdVerified(cred.loginCustomerIdVerifiedAt, now)) {
    return false;
  }
  const verifiedFor = normalizeCustomerId(cred.loginCustomerIdVerifiedForCustomerId ?? "");
  if (!verifiedFor) return false;
  return verifiedFor === normalizeCustomerId(cred.customerId);
}

export function buildGoogleAdsLoginVerifiedStamp(customerId: string): {
  loginCustomerIdVerifiedAt: string;
  loginCustomerIdVerifiedForCustomerId: string;
} {
  const normalized = normalizeCustomerId(customerId);
  return {
    loginCustomerIdVerifiedAt: new Date().toISOString(),
    loginCustomerIdVerifiedForCustomerId: normalized,
  };
}

/**
 * 解析 Google Ads refresh 应使用的 OAuth client。
 * 顺序：Ads 凭证 → 同店 GMC 凭证（组合授权共用 refresh token）→ 应用 env。
 */
export async function resolveGoogleAdsOAuthClient(
  shop: string,
  cred: GoogleAdsCredential,
): Promise<{ clientId: string; clientSecret: string } | null> {
  const adsClientId = cred.clientId?.trim();
  const adsClientSecret = cred.clientSecret?.trim();
  if (adsClientId && adsClientSecret) {
    return { clientId: adsClientId, clientSecret: adsClientSecret };
  }

  const gmc = await getGoogleMerchantCredential(shop);
  const gmcClientId = gmc?.clientId?.trim();
  const gmcClientSecret = gmc?.clientSecret?.trim();
  if (gmcClientId && gmcClientSecret) {
    return { clientId: gmcClientId, clientSecret: gmcClientSecret };
  }

  const env = getGoogleOAuthClient();
  if (env.clientId && env.clientSecret) {
    return env;
  }
  return null;
}

function handleGoogleAdsRefreshFailure(params: {
  shop: string;
  cred: GoogleAdsCredential;
  error: string;
  oauthError?: string;
}): string {
  const tokenStillUsable = isAccessTokenUsable(params.cred.accessTokenExpiresAt, Date.now());
  if (isGoogleOAuthRefreshAuthError(params.oauthError) || !tokenStillUsable) {
    console.warn(
      `${LOG_PREFIX} step=refresh_token shop=${params.shop} customerId=${params.cred.customerId} oauthError=${params.oauthError ?? "none"} error=${params.error} action=reauth_required`,
    );
    throw new Error(GOOGLE_ADS_REAUTH_REQUIRED_MESSAGE);
  }
  console.warn(
    `${LOG_PREFIX} step=refresh_token shop=${params.shop} customerId=${params.cred.customerId} oauthError=${params.oauthError ?? "none"} error=${params.error} action=use_stored_access_token`,
  );
  return params.cred.accessToken;
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
  if (stored && isGoogleAdsLoginBindingTrusted(cred, Date.now())) {
    return stored;
  }

  const resolved = await resolveLoginCustomerId({
    accessToken,
    developerToken,
    customerId: cred.customerId,
    preferredLoginCustomerId: stored || undefined,
    accessibleCustomerIds: [
      ...(cred.availableAccounts?.map((a) => a.loginCustomerId ?? a.id) ?? []),
      cred.customerId,
    ],
  });

  // 不传 accessTokenExpiresAt：accessToken 未变，交给存储层沿用刷新流程写下的过期时刻。
  await setGoogleAdsCredential(shop, {
    accessToken,
    refreshToken: cred.refreshToken,
    clientId: cred.clientId,
    clientSecret: cred.clientSecret,
    customerId: cred.customerId,
    loginCustomerId: resolved,
    ...buildGoogleAdsLoginVerifiedStamp(cred.customerId),
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

  const oauthClient = await resolveGoogleAdsOAuthClient(shop, cred);
  if (!oauthClient) {
    console.warn(
      `${LOG_PREFIX} step=refresh_token shop=${shop} skipped=missing_oauth_client`,
    );
    if (!isAccessTokenUsable(cred.accessTokenExpiresAt, Date.now())) {
      throw new Error(GOOGLE_ADS_REAUTH_REQUIRED_MESSAGE);
    }
    return cred.accessToken;
  }

  const refreshed = await refreshGoogleAccessTokenDetailed({
    clientId: oauthClient.clientId,
    clientSecret: oauthClient.clientSecret,
    refreshToken: cred.refreshToken,
  });
  if (!refreshed.ok) {
    return handleGoogleAdsRefreshFailure({
      shop,
      cred,
      error: refreshed.error,
      oauthError: refreshed.oauthError,
    });
  }

  const shouldPersistOAuthClient = !cred.clientId?.trim() || !cred.clientSecret?.trim();
  await setGoogleAdsCredential(shop, {
    accessToken: refreshed.accessToken,
    refreshToken: cred.refreshToken,
    clientId: shouldPersistOAuthClient ? oauthClient.clientId : cred.clientId,
    clientSecret: shouldPersistOAuthClient ? oauthClient.clientSecret : cred.clientSecret,
    accessTokenExpiresAt: new Date(
      Date.now() + refreshed.expiresIn * 1000,
    ).toISOString(),
    customerId: cred.customerId,
    loginCustomerId: cred.loginCustomerId,
    // login 未变，显式带上校验戳，避免刷新 token 时把探测结果清掉。
    loginCustomerIdVerifiedAt: cred.loginCustomerIdVerifiedAt,
    loginCustomerIdVerifiedForCustomerId: cred.loginCustomerIdVerifiedForCustomerId,
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
