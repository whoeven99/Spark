import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { buildGoogleOAuthStartUrl } from "../server/adsCatalog/googleOAuth.server";

/** 兼容历史 Google Ads 授权链接，并保留单独授权语义。 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const source = new URL(request.url);
  const host = source.searchParams.get("host") ?? "";

  const result = buildGoogleOAuthStartUrl({
    flow: "ads",
    shop: session.shop,
    host,
    requestOrigin: source.origin,
  });

  if (!result.ok) {
    const target = new URL("/app/ads-catalog", source.origin);
    target.searchParams.set("shop", session.shop);
    if (host) target.searchParams.set("host", host);
    target.searchParams.set("embedded", "1");
    target.searchParams.set("googleAuth", "error");
    target.searchParams.set("reason", result.error);
    return redirect(target.toString());
  }

  return redirect(result.authUrl);
};
