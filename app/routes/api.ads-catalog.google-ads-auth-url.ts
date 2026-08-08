import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { buildGoogleCombinedOAuthStartUrl } from "../server/adsCatalog/googleOAuth.server";

/** 兼容旧入口；统一走 GMC + Ads 一次 consent。 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const source = new URL(request.url);
  const host = source.searchParams.get("host") ?? "";
  const reauth = source.searchParams.get("reauth") === "1";
  const popup = source.searchParams.get("popup") === "1";

  const result = buildGoogleCombinedOAuthStartUrl({
    shop: session.shop,
    host,
    requestOrigin: source.origin,
    reauth,
    popup,
  });

  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }

  return Response.json({ ok: true, authUrl: result.authUrl });
};
