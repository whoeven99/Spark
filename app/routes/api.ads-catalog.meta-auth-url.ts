import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { buildMetaOAuthStartUrl } from "../server/adsCatalog/metaOAuth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const source = new URL(request.url);
  const host = source.searchParams.get("host") ?? "";

  const result = await buildMetaOAuthStartUrl({
    shop: session.shop,
    host,
    requestOrigin: source.origin,
  });

  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }

  return Response.json({ ok: true, authUrl: result.authUrl });
};
