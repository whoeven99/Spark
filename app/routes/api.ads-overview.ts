/**
 * 广告汇总只读接口：一次返回跨平台广告聚合，供 Ads Catalog 等只读页面复用。
 * 纯库内聚合，不回源平台 API，也不下发任何凭证明文。
 */
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { buildAdsOverview } from "../server/adsInsights/overview.server";
import { parseRangeDays } from "../server/adsInsights/dateRange.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const rangeDays = parseRangeDays(url.searchParams.get("range"));

  try {
    const overview = await buildAdsOverview({ shop: session.shop, rangeDays });
    return Response.json({ ok: true, overview });
  } catch (error) {
    console.error("[AdsOverview] build failed:", error);
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
};
