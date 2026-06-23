import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { fetchGoogleAdsMetrics } from "../server/adsCatalog/googleAdsMetrics.server";
import { formatOutboundErrorLog } from "../server/common/outboundError.server";

const LOG_PREFIX = "[AdsCatalog][GoogleAdsMetrics]";

/**
 * GET /api/ads-catalog/google-ads-metrics
 *
 * 返回当前店铺绑定 Google Ads 账户的过去 7 天广告系列指标。
 * 需要 Shopify admin 鉴权；Google Ads 凭证未配置或缺少 developer token 时返回 null 数据。
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    const result = await fetchGoogleAdsMetrics(session.shop);
    if (!result) {
      return Response.json({
        ok: false,
        reason: "not_configured",
        message: "Google Ads 账户未绑定或缺少 developer token 配置",
      });
    }
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(
      `${LOG_PREFIX} API loader failed shop=${session.shop} ${formatOutboundErrorLog(e)}`,
    );
    if (e instanceof Error && e.stack) {
      console.error(`${LOG_PREFIX} API loader stack shop=${session.shop} ${e.stack}`);
    }
    return Response.json({ ok: false, reason: "api_error", message }, { status: 500 });
  }
};
