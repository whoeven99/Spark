import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { recordAppInstalled } from "../server/commonEventLog/index.server";
import { buildSessionTokenBounceParamRedirect } from "../server/shopify/sessionTokenBounce.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { buildEmbeddedAppPath, getAppEntryConfig } from "../config/appEntry.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const recoveredBounceUrl = buildSessionTokenBounceParamRedirect(request);
  if (recoveredBounceUrl) {
    throw redirect(recoveredBounceUrl);
  }

  const { session } = await authenticate.admin(request);

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

  const { home } = getAppEntryConfig();
  throw redirect(buildEmbeddedAppPath(home, request));
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
