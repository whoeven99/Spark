import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { loadGooglePixelActivitySummary } from "../server/aliyunLog/googlePixelActivity.server";

/**
 * GET /api/ads-catalog/google-pixel-activity?range=1|7|30
 * Google Pixel Event activity 汇总：卡片计数、日趋势、漏斗。
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const summary = await loadGooglePixelActivitySummary({
    shop: session.shop,
    range: url.searchParams.get("range"),
  });
  return Response.json({ ok: true, ...summary });
};
