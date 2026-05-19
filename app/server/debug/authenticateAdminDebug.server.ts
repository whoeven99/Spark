import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/tool";
import { authenticate, sessionStorage } from "../../shopify.server";
import {
  debugAuthLog,
  extractAuthRequestContext,
  extractEnvSnapshot,
  extractRedirectInfo,
} from "./authDebug.server";

type AdminAuthResult = {
  admin: ShopifyAdminGraphqlClient;
  session: {
    id: string;
    shop: string;
    scope?: string | null;
    isOnline?: boolean;
  };
};

export async function debugAuthenticateAdmin(
  request: Request,
  route: string,
): Promise<AdminAuthResult> {
  const context = extractAuthRequestContext(request);
  const env = extractEnvSnapshot();

  debugAuthLog({
    hypothesisId: "B",
    location: "authenticateAdminDebug.server.ts:entry",
    message: "authenticate.admin called",
    data: { route, context, env },
  });

  if (context.shop) {
    try {
      const offlineId = `offline_${context.shop}`;
      const onlineId = `${context.shop}_${context.shop}`;
      const offlineSession = await sessionStorage.loadSession(offlineId);
      const onlineSession = await sessionStorage.loadSession(onlineId);
      debugAuthLog({
        hypothesisId: "C",
        location: "authenticateAdminDebug.server.ts:session",
        message: "session lookup before auth",
        data: {
          route,
          shop: context.shop,
          offlineSessionExists: Boolean(offlineSession),
          onlineSessionExists: Boolean(onlineSession),
          offlineScope: offlineSession?.scope ?? null,
          offlineIsOnline: offlineSession?.isOnline ?? null,
        },
      });
    } catch (sessionError) {
      debugAuthLog({
        hypothesisId: "C",
        location: "authenticateAdminDebug.server.ts:session-error",
        message: "session lookup failed",
        data: {
          route,
          shop: context.shop,
          error:
            sessionError instanceof Error
              ? sessionError.message
              : String(sessionError),
        },
      });
    }
  }

  try {
    const result = await authenticate.admin(request);
    debugAuthLog({
      hypothesisId: "D",
      location: "authenticateAdminDebug.server.ts:success",
      message: "authenticate.admin succeeded",
      data: {
        route,
        shop: result.session.shop,
        scope: result.session.scope ?? null,
        isOnline: result.session.isOnline ?? null,
      },
    });
    return result;
  } catch (error) {
    const redirectInfo = extractRedirectInfo(error);
    debugAuthLog({
      hypothesisId: redirectInfo.isAccountsShopify ? "D" : "A",
      location: "authenticateAdminDebug.server.ts:redirect",
      message: "authenticate.admin threw redirect/response",
      data: {
        route,
        context,
        env,
        redirectInfo,
        appUrlMatchesRequest:
          env.shopifyAppUrl !== "(unset)" &&
          new URL(request.url).origin === env.shopifyAppUrl,
        missingHostParam: !context.host && context.pathname.startsWith("/app"),
      },
    });
    throw error;
  }
}
