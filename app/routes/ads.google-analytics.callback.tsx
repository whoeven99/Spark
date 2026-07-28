import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  buildGa4OAuthReturnUrl,
  buildGa4OAuthPopupCloseHtml,
  exchangeCodeForTokens,
  getGoogleOAuthClient,
  getRedirectUri,
  verifyOAuthState,
} from "../server/adsCatalog/googleOAuth.server";
import { listGa4Properties } from "../server/googleAnalytics/ga4Api.server";
import {
  clearGa4Pending,
  deleteGa4Credential,
  setGa4Credential,
  setGa4Pending,
} from "../server/googleAnalytics/ga4Credentials.server";

const CALLBACK_PATH = "/ads/google-analytics/callback";

function appRedirect(
  request: Request,
  shop: string,
  host: string,
  appOrigin: string,
  params: Record<string, string>,
): Response {
  return redirect(buildGa4OAuthReturnUrl({ shop, host, appOrigin, query: params, request }));
}

function popupClose(params: Record<string, string>): Response {
  return new Response(buildGa4OAuthPopupCloseHtml(params), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function oauthStateErrorResponse(): Response {
  return new Response(
    "Google OAuth state 无效或已过期。请关闭此页，从 Shopify 后台重新打开应用后再试。",
    { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const incoming = new URL(request.url);
  const state = incoming.searchParams.get("state") ?? "";
  const code = incoming.searchParams.get("code");
  const oauthError = incoming.searchParams.get("error");

  const verified = verifyOAuthState(state);
  if (!verified || verified.flow !== "ga4") {
    return oauthStateErrorResponse();
  }
  const { shop, host, appOrigin, popup } = verified;

  const respond = (params: Record<string, string>): Response =>
    popup
      ? popupClose(params)
      : appRedirect(request, shop, host, appOrigin, params);

  if (oauthError) {
    return respond({ ga4Auth: "cancelled" });
  }
  if (!code) {
    return respond({ ga4Auth: "error", reason: "Google 未返回授权 code" });
  }

  try {
    const tokens = await exchangeCodeForTokens(
      code,
      getRedirectUri(CALLBACK_PATH, incoming.origin),
    );
    const properties = await listGa4Properties(tokens.accessToken);
    const { clientId, clientSecret } = getGoogleOAuthClient();

    if (properties.length === 0) {
      return respond({ ga4Auth: "error", errorCode: "no_properties" });
    }

    if (properties.length === 1) {
      await clearGa4Pending(shop);
      await setGa4Credential(shop, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        clientId,
        clientSecret,
        properties: [
          {
            propertyId: properties[0].propertyId,
            propertyName: properties[0].propertyName,
            accountName: properties[0].accountName,
            accountId: properties[0].accountId,
          },
        ],
        allProperties: properties,
      });
      return respond({ ga4Auth: "success", propertyName: properties[0].propertyName });
    }

    // 多属性：存 pending，让用户在设置页选择
    await deleteGa4Credential(shop);
    await clearGa4Pending(shop);
    await setGa4Pending(shop, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      clientId,
      clientSecret,
      properties,
    });
    return respond({ ga4Auth: "select" });
  } catch (e) {
    return respond({
      ga4Auth: "error",
      reason: e instanceof Error ? e.message : "Google Analytics 4 授权失败",
    });
  }
};
