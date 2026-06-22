import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { buildTiktokOAuthStartUrl } from "../server/adsCatalog/tiktokOAuth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const incoming = new URL(request.url);
  const host = incoming.searchParams.get("host") ?? undefined;

  const result = buildTiktokOAuthStartUrl({
    shop: session.shop,
    host,
    requestOrigin: incoming.origin,
  });

  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }
  return Response.json({ ok: true, authUrl: result.authUrl });
};
