import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { buildMetaPixelDataOAuthStartUrl } from "../server/adsCatalog/metaOAuth.server";

/** 启动 Meta Pixel 数据页手动拉数测试 OAuth。 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const source = new URL(request.url);
  const host = source.searchParams.get("host") ?? "";
  const popup = source.searchParams.get("popup") === "1";

  const result = await buildMetaPixelDataOAuthStartUrl({
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
