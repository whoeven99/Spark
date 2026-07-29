import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  buildGoogleOAuthReturnUrl,
  buildGoogleAdsSandboxOAuthReturnUrl,
  buildOAuthPopupCloseHtml,
  exchangeCodeForTokens,
  getAdsCustomers,
  getGoogleAdsDeveloperToken,
  getGoogleOAuthClient,
  getRedirectUri,
  verifyOAuthState,
  type AdsCustomer,
  type OAuthTokens,
} from "../server/adsCatalog/googleOAuth.server";
import { resolveLoginCustomerId } from "../server/adsCatalog/googleAdsApi.server";
import {
  setGoogleAdsCredential,
  setGoogleAdsPending,
  clearGoogleAdsPending,
  getGoogleAdsCredential,
  deleteGoogleAdsCredential,
  setGoogleAdsSandboxCredential,
  setGoogleAdsSandboxPending,
  clearGoogleAdsSandboxPending,
  getGoogleAdsSandboxCredential,
  deleteGoogleAdsSandboxCredential,
} from "../server/adsCatalog/credentialStore.server";

const CALLBACK_PATH = "/ads/google-ads/callback";

function appRedirect(
  request: Request,
  shop: string,
  host: string,
  appOrigin: string,
  params: Record<string, string>,
  flow: "ads" | "ads_sandbox",
) {
  const buildReturn =
    flow === "ads_sandbox" ? buildGoogleAdsSandboxOAuthReturnUrl : buildGoogleOAuthReturnUrl;
  return redirect(buildReturn({ shop, host, appOrigin, query: params, request }));
}

function oauthStateErrorResponse(): Response {
  return new Response(
    "Google OAuth state 无效或已过期。请关闭此页，从 Shopify 后台重新打开应用后再试。",
    { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}

function popupClose(flow: "ads" | "ads_sandbox", params: Record<string, string>): Response {
  const messageType = flow === "ads_sandbox" ? "google_ads_sandbox_oauth" : "ads_catalog_oauth";
  return new Response(buildOAuthPopupCloseHtml(messageType, params), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
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

async function adsOAuthRequiresSelection(
  shop: string,
  isSandbox: boolean,
  customerCount: number,
): Promise<boolean> {
  if (customerCount > 1) return true;
  if (customerCount !== 1) return false;
  const existing = isSandbox
    ? await getGoogleAdsSandboxCredential(shop)
    : await getGoogleAdsCredential(shop);
  return Boolean(existing);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const incoming = new URL(request.url);
  const state = incoming.searchParams.get("state") ?? "";
  const code = incoming.searchParams.get("code");
  const oauthError = incoming.searchParams.get("error");

  const verified = verifyOAuthState(state);
  if (!verified || (verified.flow !== "ads" && verified.flow !== "ads_sandbox")) {
    return oauthStateErrorResponse();
  }
  const { shop, host, appOrigin, flow, popup } = verified;
  const isSandbox = flow === "ads_sandbox";

  const respond = (params: Record<string, string>): Response =>
    popup
      ? popupClose(flow, params)
      : appRedirect(request, shop, host, appOrigin, params, flow);

  if (oauthError) {
    return respond(
      isSandbox ? { googleAdsSandboxAuth: "cancelled" } : { adsAuth: "cancelled" },
    );
  }
  if (!code) {
    return respond(
      isSandbox
        ? { googleAdsSandboxAuth: "error", reason: "Google 未返回授权 code" }
        : { adsAuth: "error", reason: "Google 未返回授权 code" },
    );
  }

  const developerToken = getGoogleAdsDeveloperToken();
  if (!developerToken) {
    return respond(
      isSandbox
        ? {
            googleAdsSandboxAuth: "error",
            reason: "缺少 GOOGLE_ADS_DEVELOPER_TOKEN 环境变量",
          }
        : { adsAuth: "error", reason: "缺少 GOOGLE_ADS_DEVELOPER_TOKEN 环境变量" },
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(
      code,
      getRedirectUri(CALLBACK_PATH, incoming.origin),
    );
    const customers = await getAdsCustomers(tokens.accessToken, developerToken);
    const { clientId, clientSecret } = getGoogleOAuthClient();

    if (customers.length === 0) {
      return respond(
        isSandbox
          ? {
              googleAdsSandboxAuth: "error",
              reason: "该 Google 账号未关联任何 Google Ads 广告账户",
            }
          : { adsAuth: "error", reason: "该 Google 账号未关联任何 Google Ads 广告账户" },
      );
    }

    const requiresSelection = await adsOAuthRequiresSelection(
      shop,
      isSandbox,
      customers.length,
    );

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
      if (isSandbox) {
        await clearGoogleAdsSandboxPending(shop);
        await setGoogleAdsSandboxCredential(shop, {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          customerId,
          loginCustomerId,
          descriptiveName: customers[0].descriptiveName,
        });
        return respond({
          googleAdsSandboxAuth: "success",
          customerId: customers[0].formatted,
        });
      }
      await clearGoogleAdsPending(shop);
      await setGoogleAdsCredential(shop, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        customerId,
        loginCustomerId,
      });
      return respond({
        adsAuth: "success",
        customerId: customers[0].formatted,
      });
    }

    const pendingPayload = buildAdsPendingPayload(tokens, customers, clientId, clientSecret);

    if (isSandbox) {
      await deleteGoogleAdsSandboxCredential(shop);
      await clearGoogleAdsSandboxPending(shop);
      await setGoogleAdsSandboxPending(shop, pendingPayload);
      return respond({ googleAdsSandboxAuth: "select" });
    }

    await deleteGoogleAdsCredential(shop);
    await clearGoogleAdsPending(shop);
    await setGoogleAdsPending(shop, pendingPayload);
    return respond({ adsAuth: "select" });
  } catch (e) {
    return respond(
      isSandbox
        ? {
            googleAdsSandboxAuth: "error",
            reason: e instanceof Error ? e.message : "Google Ads 测试账号授权失败",
          }
        : {
            adsAuth: "error",
            reason: e instanceof Error ? e.message : "Google Ads 授权失败",
          },
    );
  }
};
