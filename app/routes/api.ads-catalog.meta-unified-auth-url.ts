import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { buildMetaUnifiedOAuthStartUrl } from "../server/adsCatalog/metaOAuth.server";

/** GET /api/ads-catalog/meta-unified-auth-url — 一次 Business Login 连接 Meta 全部能力。 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const source = new URL(request.url);
  const result = await buildMetaUnifiedOAuthStartUrl({
    shop: session.shop,
    host: source.searchParams.get("host") ?? "",
    requestOrigin: source.origin,
    popup: source.searchParams.get("popup") === "1",
  });

  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }
  return Response.json({ ok: true, authUrl: result.authUrl });
};
