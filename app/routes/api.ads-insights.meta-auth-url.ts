import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { buildMetaAdsOAuthStartUrl } from "../server/adsCatalog/metaOAuth.server";

/**
 * GET /api/ads-insights/meta-auth-url
 * 启动独立 Meta Ads OAuth（ads_read + ads_management + pages_show_list）。
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const source = new URL(request.url);
  const host = source.searchParams.get("host") ?? "";
  const popup = source.searchParams.get("popup") === "1";

  const result = await buildMetaAdsOAuthStartUrl({
    shop: session.shop,
    host,
    requestOrigin: source.origin,
    popup,
  });

  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }
  return Response.json({ ok: true, authUrl: result.authUrl });
};
