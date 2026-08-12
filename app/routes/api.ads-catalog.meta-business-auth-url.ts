import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { buildMetaBusinessOAuthStartUrl } from "../server/adsCatalog/metaOAuth.server";

/** GET /api/ads-catalog/meta-business-auth-url — 统一 Meta Business Login OAuth。 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const source = new URL(request.url);
  const host = source.searchParams.get("host") ?? "";
  const popup = source.searchParams.get("popup") === "1";

  const result = await buildMetaBusinessOAuthStartUrl({
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
