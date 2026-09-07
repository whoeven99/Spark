import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { buildSessionTokenBounceParamRedirect } from "../server/shopify/sessionTokenBounce.server";
import { captureReferralInstallFromRequest } from "../server/billing/promo/referralInstall.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const recoveredBounceUrl = buildSessionTokenBounceParamRedirect(request);
  if (recoveredBounceUrl) {
    throw redirect(recoveredBounceUrl);
  }

  const { session } = await authenticate.admin(request);
  void captureReferralInstallFromRequest(session.shop, request).catch((error) => {
    console.warn("[ReferralInstall] auth capture failed", error);
  });
  return null;
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
