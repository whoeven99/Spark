import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  META_BUSINESS_CALLBACK_PATH,
  buildMetaBusinessOAuthReturnUrl,
  exchangeMetaCodeForToken,
  getMetaRedirectUri,
  resolveMetaOAuthClient,
  verifyMetaOAuthState,
} from "../server/adsCatalog/metaOAuth.server";
import {
  clearMetaBusinessPending,
  clearMetaCatalogPending,
  clearMetaCapiPending,
} from "../server/adsCatalog/credentialStore.server";
import { persistMetaBusinessOnboarding } from "../server/adsCatalog/metaBusinessOnboarding.server";
import { buildOAuthPopupCloseHtml } from "../server/adsCatalog/googleOAuth.server";

function appRedirect(
  request: Request,
  shop: string,
  host: string,
  appOrigin: string,
  params: Record<string, string>,
) {
  return redirect(
    buildMetaBusinessOAuthReturnUrl({ shop, host, appOrigin, query: params, request }),
  );
}

function oauthStateErrorResponse(): Response {
  return new Response(
    "Meta Business OAuth state 无效或已过期。请关闭此页，从 Shopify 后台重新打开应用后再试。",
    { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}

function popupClose(params: Record<string, string>): Response {
  return new Response(buildOAuthPopupCloseHtml("meta_business_oauth", params), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const incoming = new URL(request.url);
  const state = incoming.searchParams.get("state") ?? "";
  const code = incoming.searchParams.get("code");
  const oauthError =
    incoming.searchParams.get("error_reason") || incoming.searchParams.get("error");

  const verified = verifyMetaOAuthState(state, 15 * 60 * 1000, "meta_business");
  if (!verified) {
    return oauthStateErrorResponse();
  }
  const { shop, host, appOrigin, popup } = verified;

  const respond = (params: Record<string, string>): Response =>
    popup
      ? popupClose(params)
      : appRedirect(request, shop, host, appOrigin, params);

  if (oauthError) {
    return respond({ metaBusinessAuth: "cancelled" });
  }
  if (!code) {
    return respond({
      metaBusinessAuth: "error",
      reason: "Meta 未返回授权 code",
    });
  }

  try {
    const client = resolveMetaOAuthClient();
    if (!client) {
      return respond({
        metaBusinessAuth: "error",
        reason: "缺少 Meta App 凭证（META_APP_ID / META_APP_SECRET）",
      });
    }

    const bisuToken = await exchangeMetaCodeForToken({
      code,
      redirectUri: getMetaRedirectUri(META_BUSINESS_CALLBACK_PATH, incoming.origin),
      client,
    });

    await Promise.all([
      clearMetaCatalogPending(shop),
      clearMetaCapiPending(shop),
      clearMetaBusinessPending(shop),
    ]);

    const result = await persistMetaBusinessOnboarding({
      shop,
      bisuToken,
    });

    if (result.status === "saved") {
      return respond({
        metaBusinessAuth: "success",
        catalogId: result.catalogId,
        adAccountId: result.adAccountId,
        ...(result.pixelId ? { pixelId: result.pixelId } : {}),
      });
    }

    return respond({ metaBusinessAuth: "select" });
  } catch (e) {
    return respond({
      metaBusinessAuth: "error",
      reason: e instanceof Error ? e.message : "Meta Business 授权失败",
    });
  }
};
