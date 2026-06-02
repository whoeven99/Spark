import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { recordAppInstalled } from "../server/commonEventLog/index.server";
import {
  syncSessionShopProfile,
  syncSessionUserProfileFromOnline,
} from "../server/session/syncSessionUserProfile.server";
import { buildSessionTokenBounceParamRedirect } from "../server/shopify/sessionTokenBounce.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const recoveredBounceUrl = buildSessionTokenBounceParamRedirect(request);
  if (recoveredBounceUrl) {
    throw redirect(recoveredBounceUrl);
  }

  const { session, admin } = await authenticate.admin(request);

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

  try {
    await syncSessionUserProfileFromOnline(session);
  } catch (error) {
    console.warn("[SessionSync] syncSessionUserProfileFromOnline failed:", error);
  }

  try {
    await syncSessionShopProfile(session.shop, admin);
  } catch (error) {
    console.warn("[SessionSync] syncSessionShopProfile failed:", error);
  }

  return null;
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
