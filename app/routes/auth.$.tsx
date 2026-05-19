
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { debugAuthenticateAdmin } from "../server/debug/authenticateAdminDebug.server";
import { debugAuthLog, extractAuthRequestContext } from "../server/debug/authDebug.server";
import { recordAppInstalled } from "../server/commonEventLog/index.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const context = extractAuthRequestContext(request);
  // #region agent log
  debugAuthLog({
    hypothesisId: "A",
    location: "auth.$.tsx:entry",
    message: "auth route hit",
    data: { context },
  });
  // #endregion

  const { session } = await debugAuthenticateAdmin(request, "auth.catch-all");

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

  return null;
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
