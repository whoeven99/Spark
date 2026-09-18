import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  buildMetaUnifiedOAuthReturnUrl,
  exchangeMetaCodeForToken,
  getMetaRedirectUri,
  META_UNIFIED_CALLBACK_PATH,
  resolveMetaOAuthClient,
  verifyMetaOAuthState,
} from "../server/adsCatalog/metaOAuth.server";
import {
  completeMetaUnifiedOnboarding,
  toMetaUnifiedAuthParams,
} from "../server/adsCatalog/metaUnifiedOnboarding.server";
import { logFullMetaCapiAccessToken } from "../server/adsCatalog/metaCapiLog.server";
import { buildOAuthPopupCloseHtml } from "../server/adsCatalog/googleOAuth.server";

function popupClose(params: Record<string, string>): Response {
  return new Response(buildOAuthPopupCloseHtml("meta_unified_oauth", params), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const incoming = new URL(request.url);
  const state = incoming.searchParams.get("state") ?? "";
  const code = incoming.searchParams.get("code");
  const oauthError = incoming.searchParams.get("error_reason") || incoming.searchParams.get("error");
  const verified = verifyMetaOAuthState(state, 15 * 60 * 1000, "meta_unified");
  if (!verified) {
    return new Response("Meta unified OAuth state 无效或已过期", { status: 400 });
  }
  const { shop, host, appOrigin, popup } = verified;
  const respond = (params: Record<string, string>) =>
    popup
      ? popupClose(params)
      : redirect(buildMetaUnifiedOAuthReturnUrl({ shop, host, appOrigin, query: params, request }));

  if (oauthError) return respond({ metaUnifiedAuth: "cancelled" });
  if (!code) return respond({ metaUnifiedAuth: "error", reason: "Meta 未返回授权 code" });

  try {
    const client = resolveMetaOAuthClient();
    if (!client) throw new Error("缺少 Meta App 凭证");
    const token = await exchangeMetaCodeForToken({
      code,
      redirectUri: getMetaRedirectUri(META_UNIFIED_CALLBACK_PATH, incoming.origin),
      client,
    });
    logFullMetaCapiAccessToken({ token, source: "unified_business_login", shop });

    const result = await completeMetaUnifiedOnboarding({ shop, token });
    return respond(toMetaUnifiedAuthParams(result));
  } catch (e) {
    console.error(
      `[AdsCatalog][MetaUnified] step=failed shop=${shop} err=${e instanceof Error ? e.message : String(e)}`,
    );
    return respond({
      metaUnifiedAuth: "error",
      reason: e instanceof Error ? e.message : "Meta 统一授权失败",
    });
  }
};
