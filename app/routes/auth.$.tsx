import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { recordAppInstalled } from "../server/commonEventLog/index.server";
import {
  scheduleEnsureShopProfile,
  scheduleShopProfileBootstrap,
} from "../server/shopProfile/index.server";
import { getAppEntry } from "../config/appEntry.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  try {
    const installRecorded = await recordAppInstalled({
      shop: session.shop,
      sessionId: session.id,
      scope: session.scope,
      isOnline: session.isOnline,
      source: "auth_callback",
    });
    if (installRecorded) {
      scheduleShopProfileBootstrap({
        admin,
        shop: session.shop,
        appName: getAppEntry(),
        reason: "install",
      });
    } else {
      scheduleEnsureShopProfile({
        admin,
        shop: session.shop,
        appName: getAppEntry(),
      });
    }
  } catch (error) {
    console.error("[CommonEvent] recordAppInstalled failed:", error);
  }

  return null;
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
