import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { buildGoogleOAuthStartUrl } from "../server/adsCatalog/googleOAuth.server";

/** 兼容旧链接；推荐前端走 /api/ads-catalog/google-merchant-auth-url。 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const source = new URL(request.url);
  const host = source.searchParams.get("host") ?? "";

  const result = buildGoogleOAuthStartUrl({
    flow: "gmc",
    shop: session.shop,
    host,
    requestOrigin: source.origin,
  });

  if (!result.ok) {
    const target = new URL("/app/ads-catalog", source.origin);
    target.searchParams.set("shop", session.shop);
    if (host) target.searchParams.set("host", host);
    target.searchParams.set("embedded", "1");
    target.searchParams.set("gmcAuth", "error");
    target.searchParams.set("reason", result.error);
    return redirect(target.toString());
  }

  return redirect(result.authUrl);
};
