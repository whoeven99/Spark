import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { loadMetaPixelDataStats } from "../server/adsCatalog/metaPixelData.server";

/**
 * GET /api/ads-catalog/meta-pixel-stats
 * 从 Meta Graph API 拉取 Pixel 元数据与近 7 天 stats 汇总。
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "manual" ? "manual" : "auto";
  const stats = await loadMetaPixelDataStats({ shop: session.shop, mode });
  return Response.json({ ok: true, mode, ...stats });
};
