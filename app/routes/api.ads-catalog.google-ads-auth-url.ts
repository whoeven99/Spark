import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { buildGoogleOAuthStartUrl } from "../server/adsCatalog/googleOAuth.server";

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
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }

  return Response.json({ ok: true, authUrl: result.authUrl });
};
