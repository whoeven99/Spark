import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  META_PIXEL_DATA_CALLBACK_PATH,
  buildMetaPixelDataOAuthReturnUrl,
  exchangeForLongLivedMetaToken,
  exchangeMetaCodeForToken,
  getMetaRedirectUri,
  logMetaOAuthCancelled,
  logMetaOAuthError,
  resolveMetaOAuthClient,
  verifyMetaOAuthState,
} from "../server/adsCatalog/metaOAuth.server";
import { setMetaPixelDataManualCredential } from "../server/adsCatalog/credentialStore.server";
import { buildOAuthPopupCloseHtml } from "../server/adsCatalog/googleOAuth.server";

function appRedirect(
  request: Request,
  shop: string,
  host: string,
  appOrigin: string,
  params: Record<string, string>,
) {
  return redirect(
    buildMetaPixelDataOAuthReturnUrl({ shop, host, appOrigin, query: params, request }),
  );
}

function oauthStateErrorResponse(): Response {
  return new Response(
    "Meta Pixel data OAuth state 无效或已过期。请关闭此页，从数据页重新发起授权。",
    { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}

function popupClose(params: Record<string, string>): Response {
  return new Response(buildOAuthPopupCloseHtml("meta_pixel_data_oauth", params), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/** Meta Pixel 数据页手动拉数测试 OAuth 回调（仅保存 access token，不绑定广告账户）。 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const incoming = new URL(request.url);
  const state = incoming.searchParams.get("state") ?? "";
  const code = incoming.searchParams.get("code");
  const oauthError =
    incoming.searchParams.get("error_reason") || incoming.searchParams.get("error");

  const verified = verifyMetaOAuthState(state, 15 * 60 * 1000, "meta_pixel_data");
  if (!verified) {
    logMetaOAuthError({
      flow: "meta_pixel_data",
      step: "invalid_state",
      error: "Meta Pixel data OAuth state 无效或已过期",
    });
    return oauthStateErrorResponse();
  }
  const { shop, host, appOrigin, popup } = verified;

  const respond = (params: Record<string, string>): Response =>
    popup ? popupClose(params) : appRedirect(request, shop, host, appOrigin, params);

  if (oauthError) {
    logMetaOAuthCancelled({ flow: "meta_pixel_data", shop, oauthError });
    return respond({ metaPixelDataAuth: "cancelled" });
  }
  if (!code) {
    const reason = "Meta 未返回授权 code";
    logMetaOAuthError({ flow: "meta_pixel_data", shop, step: "missing_code", error: reason });
    return respond({
      metaPixelDataAuth: "error",
      reason,
    });
  }

  try {
    const client = resolveMetaOAuthClient();
    if (!client) {
      const reason = "缺少 Meta App 凭证（META_APP_ID / META_APP_SECRET）";
      logMetaOAuthError({ flow: "meta_pixel_data", shop, step: "missing_client", error: reason });
      return respond({
        metaPixelDataAuth: "error",
        reason,
      });
    }

    const shortToken = await exchangeMetaCodeForToken({
      code,
      redirectUri: getMetaRedirectUri(META_PIXEL_DATA_CALLBACK_PATH, incoming.origin),
      client,
    });
    const accessToken = await exchangeForLongLivedMetaToken({ shortToken, client });
    await setMetaPixelDataManualCredential(shop, { accessToken });

    return respond({ metaPixelDataAuth: "success" });
  } catch (e) {
    logMetaOAuthError({ flow: "meta_pixel_data", shop, step: "callback", error: e });
    return respond({
      metaPixelDataAuth: "error",
      reason: e instanceof Error ? e.message : "Meta Pixel 数据授权失败",
    });
  }
};
