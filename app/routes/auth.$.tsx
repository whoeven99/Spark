import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { recordAppInstalled } from "../server/commonEventLog/index.server";
import { scheduleProfileSync } from "../server/profile/scheduleProfileSync.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  scheduleProfileSync({
    shop: session.shop,
    sessionId: session.id,
    admin,
    sessionFromAuth: {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      refreshTokenExpires: session.refreshTokenExpires,
    },
  });

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
