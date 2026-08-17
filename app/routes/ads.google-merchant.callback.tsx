import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  buildGoogleOAuthReturnUrl,
  buildOAuthPopupCloseHtml,
  exchangeCodeForTokens,
  getAdsCustomers,
  getGmcMerchantAccounts,
  getGoogleAdsDeveloperToken,
  getGoogleOAuthClient,
  getRedirectUri,
  verifyOAuthState,
  type AdsCustomer,
  type MerchantAccount,
  type OAuthTokens,
} from "../server/adsCatalog/googleOAuth.server";
import { resolveLoginCustomerId } from "../server/adsCatalog/googleAdsApi.server";
import {
  setGoogleMerchantCredential,
  setGoogleMerchantPending,
  clearGoogleMerchantPending,
  getGoogleMerchantCredential,
  setGoogleAdsCredential,
  setGoogleAdsPending,
  clearGoogleAdsPending,
  getGoogleAdsCredential,
} from "../server/adsCatalog/credentialStore.server";
import { registerGmcNotificationSubscription } from "../server/adsCatalog/gmcNotifications.server";
import { normalizeGmcOAuthError } from "../lib/gmcOAuthErrors";

const CALLBACK_PATH = "/ads/google-merchant/callback";

function oauthFailureReason(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  return normalizeGmcOAuthError(message);
}

function appRedirect(
  request: Request,
  shop: string,
  host: string,
  appOrigin: string,
  params: Record<string, string>,
) {
  return redirect(
    buildGoogleOAuthReturnUrl({ shop, host, appOrigin, query: params, request }),
  );
}

function oauthStateErrorResponse(): Response {
  return new Response(
    "Google OAuth state 无效或已过期。请关闭此页，从 Shopify 后台重新打开应用后再试。",
    { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}

function popupClose(messageType: string, params: Record<string, string>): Response {
  return new Response(buildOAuthPopupCloseHtml(messageType, params), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function buildGmcPendingPayload(
  tokens: OAuthTokens,
  accounts: MerchantAccount[],
  clientId: string,
  clientSecret: string,
) {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    clientId,
    clientSecret,
    accounts: accounts.map((a) => ({ id: a.merchantId, name: a.name })),
  };
}

function buildAdsPendingPayload(
  tokens: OAuthTokens,
  customers: AdsCustomer[],
  clientId: string,
  clientSecret: string,
) {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    clientId,
    clientSecret,
    accounts: customers.map((c) => ({
      id: c.customerId,
      formatted: c.formatted,
      name: c.descriptiveName,
      loginCustomerId: c.loginCustomerId,
    })),
  };
}

async function bindGmcSide(params: {
  shop: string;
  tokens: OAuthTokens;
  accounts: MerchantAccount[];
  clientId: string;
  clientSecret: string;
}): Promise<"success" | "select" | "empty"> {
  const { shop, tokens, accounts, clientId, clientSecret } = params;
  if (accounts.length === 0) return "empty";

  const existing = await getGoogleMerchantCredential(shop);
  const requiresSelection = accounts.length > 1 || (accounts.length === 1 && Boolean(existing));

  if (!requiresSelection && accounts.length === 1) {
    await clearGoogleMerchantPending(shop);
    await setGoogleMerchantCredential(shop, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      clientId,
      clientSecret,
      merchantId: accounts[0].merchantId,
    });
    void registerGmcNotificationSubscription({
      shop,
      merchantId: accounts[0].merchantId,
      accessToken: tokens.accessToken,
    }).catch(() => undefined);
    return "success";
  }

  // Keep the active credential while the user is choosing a replacement.
  // The new account becomes active only after the selection endpoint succeeds.
  await clearGoogleMerchantPending(shop);
  await setGoogleMerchantPending(
    shop,
    buildGmcPendingPayload(tokens, accounts, clientId, clientSecret),
  );
  return "select";
}

function buildAdsAccountOptions(customers: AdsCustomer[]) {
  return customers.map((c) => ({
    id: c.customerId,
    formatted: c.formatted,
    name: c.descriptiveName,
    loginCustomerId: c.loginCustomerId,
  }));
}

async function bindAdsSide(params: {
  shop: string;
  tokens: OAuthTokens;
  customers: AdsCustomer[];
  clientId: string;
  clientSecret: string;
  developerToken: string;
}): Promise<"success" | "select" | "empty"> {
  const { shop, tokens, customers, clientId, clientSecret, developerToken } = params;
  if (customers.length === 0) return "empty";

  const existing = await getGoogleAdsCredential(shop);
  const requiresSelection = customers.length > 1 || (customers.length === 1 && Boolean(existing));

  if (!requiresSelection && customers.length === 1) {
    const customerId = customers[0].customerId;
    const loginCustomerId =
      customers[0].loginCustomerId ??
      (await resolveLoginCustomerId({
        accessToken: tokens.accessToken,
        developerToken,
        customerId,
        accessibleCustomerIds: customers.map((c) => c.loginCustomerId ?? c.customerId),
      }));
    await clearGoogleAdsPending(shop);
    await setGoogleAdsCredential(shop, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      customerId,
      loginCustomerId,
      availableAccounts: buildAdsAccountOptions(customers),
    });
    return "success";
  }

  // Keep the active credential while the user is choosing a replacement.
  await clearGoogleAdsPending(shop);
  await setGoogleAdsPending(
    shop,
    buildAdsPendingPayload(tokens, customers, clientId, clientSecret),
  );
  return "select";
}

type SideAuthResult = "success" | "select" | "empty" | "error";

function sideAuthStatus(result: SideAuthResult): string {
  return result;
}

function buildCombinedRespondParams(input: {
  gmcResult: SideAuthResult;
  adsResult: SideAuthResult;
  gmcEmptyReason?: string;
  adsEmptyReason?: string;
  merchantId?: string;
  customerId?: string;
}): Record<string, string> {
  const { gmcResult, adsResult } = input;
  const gmcOk = gmcResult !== "empty" && gmcResult !== "error";
  const adsOk = adsResult !== "empty" && adsResult !== "error";

  if (!gmcOk && !adsOk) {
    return {
      googleAuth: "error",
      gmcAuth: "error",
      adsAuth: "error",
      reason:
        input.gmcEmptyReason ||
        input.adsEmptyReason ||
        "该 Google 账号未关联 Merchant Center 或 Ads 账户",
      gmcReason: input.gmcEmptyReason ?? "",
      adsReason: input.adsEmptyReason ?? "",
    };
  }

  const needsSelect = gmcResult === "select" || adsResult === "select";
  const params: Record<string, string> = {
    googleAuth: needsSelect ? "select" : gmcOk && adsOk ? "success" : "partial",
    gmcAuth: sideAuthStatus(gmcResult),
    adsAuth: sideAuthStatus(adsResult),
  };
  if (!gmcOk && input.gmcEmptyReason) params.gmcReason = input.gmcEmptyReason;
  if (!adsOk && input.adsEmptyReason) params.adsReason = input.adsEmptyReason;
  if (!gmcOk || !adsOk) {
    params.reason = !gmcOk
      ? (input.gmcEmptyReason ?? "未关联 Merchant Center 账户")
      : (input.adsEmptyReason ?? "未关联 Google Ads 广告账户");
  }
  if (input.merchantId) params.merchantId = input.merchantId;
  if (input.customerId) params.customerId = input.customerId;
  return params;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const incoming = new URL(request.url);
  const state = incoming.searchParams.get("state") ?? "";
  const code = incoming.searchParams.get("code");
  const oauthError = incoming.searchParams.get("error");

  const verified = verifyOAuthState(state);
  if (
    !verified ||
    (verified.flow !== "gmc" && verified.flow !== "ads" && verified.flow !== "gmc_ads")
  ) {
    return oauthStateErrorResponse();
  }
  const { shop, host, appOrigin, popup, flow } = verified;
  const isCombined = flow === "gmc_ads";
  const messageType =
    flow === "gmc_ads"
      ? "google_oauth"
      : flow === "ads"
        ? "ads_catalog_oauth"
        : "gmc_oauth";

  const respond = (params: Record<string, string>): Response =>
    popup
      ? popupClose(messageType, params)
      : appRedirect(request, shop, host, appOrigin, params);

  if (oauthError) {
    return respond(
      isCombined
        ? { googleAuth: "cancelled", gmcAuth: "cancelled", adsAuth: "cancelled" }
        : flow === "gmc"
          ? { gmcAuth: "cancelled" }
          : { adsAuth: "cancelled" },
    );
  }
  if (!code) {
    return respond(
      isCombined
        ? {
            googleAuth: "error",
            gmcAuth: "error",
            adsAuth: "error",
            reason: "Google 未返回授权 code",
          }
        : flow === "gmc"
          ? {
              gmcAuth: "error",
              reason: "Google 未返回授权 code",
            }
          : {
              adsAuth: "error",
              reason: "Google 未返回授权 code",
            },
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(
      code,
      getRedirectUri(CALLBACK_PATH, incoming.origin),
    );
    const { clientId, clientSecret } = getGoogleOAuthClient();

    if (flow === "gmc") {
      const accounts = await getGmcMerchantAccounts(tokens.accessToken);
      if (accounts.length === 0) {
        return respond({
          gmcAuth: "error",
          reason: "该 Google 账号未关联任何 Merchant Center 账户",
        });
      }
      const gmcResult = await bindGmcSide({
        shop,
        tokens,
        accounts,
        clientId,
        clientSecret,
      });
      if (gmcResult === "success") {
        return respond({
          gmcAuth: "success",
          merchantId: accounts[0].merchantId,
        });
      }
      return respond({ gmcAuth: "select" });
    }

    if (flow === "ads") {
      const developerToken = getGoogleAdsDeveloperToken();
      if (!developerToken) {
        return respond({
          adsAuth: "error",
          reason: "缺少 GOOGLE_ADS_DEVELOPER_TOKEN 环境变量",
        });
      }
      const customers = await getAdsCustomers(tokens.accessToken, developerToken);
      if (customers.length === 0) {
        return respond({
          adsAuth: "error",
          reason: "该 Google 账号未关联任何 Google Ads 广告账户",
        });
      }
      const adsResult = await bindAdsSide({
        shop,
        tokens,
        customers,
        clientId,
        clientSecret,
        developerToken,
      });
      if (adsResult === "success") {
        return respond({
          adsAuth: "success",
          customerId: customers[0]?.formatted ?? "",
        });
      }
      return respond({ adsAuth: "select" });
    }

    const developerToken = getGoogleAdsDeveloperToken();
    const [gmcListResult, adsListResult] = await Promise.all([
      (async (): Promise<
        | { ok: true; accounts: MerchantAccount[] }
        | { ok: false; reason: string }
      > => {
        try {
          const accounts = await getGmcMerchantAccounts(tokens.accessToken);
          return { ok: true, accounts };
        } catch (e) {
          return {
            ok: false,
            reason: oauthFailureReason(e, "GMC 账户列表获取失败"),
          };
        }
      })(),
      (async (): Promise<
        | { ok: true; customers: AdsCustomer[] }
        | { ok: false; reason: string }
      > => {
        if (!developerToken) {
          return { ok: false, reason: "缺少 GOOGLE_ADS_DEVELOPER_TOKEN 环境变量" };
        }
        try {
          const customers = await getAdsCustomers(tokens.accessToken, developerToken);
          return { ok: true, customers };
        } catch (e) {
          return {
            ok: false,
            reason: e instanceof Error ? e.message : "Google Ads 账户列表获取失败",
          };
        }
      })(),
    ]);

    let gmcEmptyReason: string | undefined;
    let accounts: MerchantAccount[] = [];
    if (!gmcListResult.ok) {
      gmcEmptyReason = gmcListResult.reason;
    } else if (gmcListResult.accounts.length === 0) {
      gmcEmptyReason = "该 Google 账号未关联任何 Merchant Center 账户";
    } else {
      accounts = gmcListResult.accounts;
    }

    let adsEmptyReason: string | undefined;
    let customers: AdsCustomer[] = [];
    if (!adsListResult.ok) {
      adsEmptyReason = adsListResult.reason;
    } else if (adsListResult.customers.length === 0) {
      adsEmptyReason = "该 Google 账号未关联任何 Google Ads 广告账户";
    } else {
      customers = adsListResult.customers;
    }

    let gmcResult: SideAuthResult = "empty";
    if (!gmcEmptyReason) {
      try {
        gmcResult = await bindGmcSide({
          shop,
          tokens,
          accounts,
          clientId,
          clientSecret,
        });
      } catch (e) {
        gmcResult = "error";
        gmcEmptyReason = oauthFailureReason(e, "GMC 账户绑定失败");
      }
    }

    let adsResult: SideAuthResult = "empty";
    if (!adsEmptyReason) {
      try {
        adsResult = await bindAdsSide({
          shop,
          tokens,
          customers,
          clientId,
          clientSecret,
          developerToken,
        });
      } catch (e) {
        adsResult = "error";
        adsEmptyReason = e instanceof Error ? e.message : "Google Ads 账户绑定失败";
      }
    }

    return respond(
      buildCombinedRespondParams({
        gmcResult,
        adsResult,
        gmcEmptyReason,
        adsEmptyReason,
        merchantId: gmcResult === "success" ? accounts[0]?.merchantId : undefined,
        customerId: adsResult === "success" ? customers[0]?.formatted : undefined,
      }),
    );
  } catch (e) {
    return respond(
      isCombined
        ? {
            googleAuth: "error",
            gmcAuth: "error",
            adsAuth: "error",
            reason: oauthFailureReason(e, "Google 授权失败"),
          }
        : flow === "gmc"
          ? {
              gmcAuth: "error",
              reason: oauthFailureReason(e, "GMC 授权失败"),
            }
          : {
              adsAuth: "error",
              reason: e instanceof Error ? e.message : "Google Ads 授权失败",
            },
    );
  }
};
