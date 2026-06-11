import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { recordAppInstalled } from "../server/commonEventLog/index.server";
import { ensureWebPixel } from "../server/webPixel/ensureWebPixel.server";
import { syncV4JobShopifyTokensFromSession } from "../server/translation/v4/syncV4JobShopifyTokens.server";
import { buildSessionTokenBounceParamRedirect } from "../server/shopify/sessionTokenBounce.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { buildEmbeddedAppPath, getAppHomePath } from "../config/appEntry.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const recoveredBounceUrl = buildSessionTokenBounceParamRedirect(request);
  if (recoveredBounceUrl) {
    throw redirect(recoveredBounceUrl);
  }

  const { admin, session } = await authenticate.admin(request);

  try {
    await recordAppInstalled({
      shop: session.shop,
      sessionId: session.id,
      scope: session.scope,
      isOnline: session.isOnline,
      source: "auth_callback",
    });
  } catch (error) {
    console.error("[CommonEvent] recordAppInstalled failed:", error);
  }

  // fire-and-forget：失败只记日志，不阻断 OAuth 跳转
  void ensureWebPixel(admin, session.shop);

  try {
    await syncV4JobShopifyTokensFromSession(session.shop, session.accessToken);
  } catch (error) {
    console.error("[v4:token-sync] auth callback sync failed:", error);
  }

  throw redirect(buildEmbeddedAppPath(getAppHomePath(), request));
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
