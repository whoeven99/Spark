import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { parseRangeDays } from "../server/adsInsights/dateRange.server";
import { fetchGoogleAdsPerformanceSummary } from "../server/adsInsights/googleAdsPerformanceSummary.server";
import { formatOutboundErrorLog } from "../server/common/outboundError.server";

const LOG_PREFIX = "[AdsCatalog][GooglePerformance]";

/**
 * GET /api/ads-catalog/google-performance?range=7|14|30
 * Pixel 数据页：Catalog 绑定的 Google Ads 账户日汇总。
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const rangeDays = parseRangeDays(url.searchParams.get("range"));

  try {
    const result = await fetchGoogleAdsPerformanceSummary(session.shop, rangeDays);
    if (!result) {
      return Response.json({
        ok: false,
        reason: "not_configured",
        message: "Google Ads 账户未绑定或缺少 developer token",
      });
    }
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(
      `${LOG_PREFIX} shop=${session.shop} range=${rangeDays} ${formatOutboundErrorLog(e)}`,
    );
    return Response.json({ ok: false, reason: "api_error", message }, { status: 500 });
  }
};
