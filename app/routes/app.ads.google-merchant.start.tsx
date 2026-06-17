import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import {
  buildAuthUrl,
  createOAuthState,
  getGoogleOAuthClient,
  getRedirectUri,
} from "../server/adsCatalog/googleOAuth.server";

const CALLBACK_PATH = "/ads/google-merchant/callback";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const source = new URL(request.url);
  const host = source.searchParams.get("host") ?? "";
  const appOrigin = (process.env.SHOPIFY_APP_URL || source.origin).replace(/\/$/, "");

  const { clientId } = getGoogleOAuthClient();
  if (!clientId) {
    const target = new URL("/app/ads-catalog", appOrigin);
    if (host) target.searchParams.set("host", host);
    target.searchParams.set("gmcAuth", "error");
    target.searchParams.set("reason", "缺少 GOOGLE_OAUTH_CLIENT_ID 环境变量");
    return redirect(target.toString());
  }

  const state = createOAuthState(session.shop, "gmc", host, appOrigin);
  const authUrl = buildAuthUrl({
    flow: "gmc",
    state,
    redirectUri: getRedirectUri(CALLBACK_PATH, source.origin),
  });
  return redirect(authUrl);
};
