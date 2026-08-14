import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { buildMetaCapiOAuthStartUrl } from "../server/adsCatalog/metaOAuth.server";

/** GET /api/ads-catalog/meta-capi-auth-url — 启动 Meta CAPI Business Login OAuth。 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const source = new URL(request.url);
  const host = source.searchParams.get("host") ?? "";
  const popup = source.searchParams.get("popup") === "1";

  const result = await buildMetaCapiOAuthStartUrl({
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
