import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { fetchTiktokAdsMetrics } from "../server/adsCatalog/tiktokAdsMetrics.server";
import { formatOutboundErrorLog } from "../server/common/outboundError.server";

const LOG_PREFIX = "[AdsCatalog][TiktokAdsMetrics]";

/**
 * GET /api/ads-catalog/tiktok-ads-metrics
 *
 * 返回当前店铺绑定 TikTok 广告主账户的过去 7 天广告系列指标。
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    const result = await fetchTiktokAdsMetrics(session.shop);
    if (!result) {
      return Response.json({
        ok: false,
        reason: "not_configured",
        message: "TikTok Ads 账户未绑定，请先在凭证页完成授权",
      });
    }
    return Response.json({
      ok: true,
      advertiserId: result.advertiserId,
      customerId: result.advertiserId,
      dateRange: result.dateRange,
      campaigns: result.campaigns,
      currencyCode: result.currencyCode,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(
      `${LOG_PREFIX} API loader failed shop=${session.shop} ${formatOutboundErrorLog(e)}`,
    );
    return Response.json({ ok: false, reason: "api_error", message }, { status: 500 });
  }
};
