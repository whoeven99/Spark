import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { parseRangeDays } from "../server/adsInsights/dateRange.server";
import { fetchUnifiedAttribution } from "../server/googleAttribution/fetchUnifiedAttribution.server";
import { formatOutboundErrorLog } from "../server/common/outboundError.server";
import type { UnifiedAttributionResult } from "../server/googleAttribution/types.server";

const LOG_PREFIX = "[GoogleAttribution][API]";

export type GoogleAttributionOverviewOk = {
  ok: true;
} & UnifiedAttributionResult;

export type GoogleAttributionOverviewNotConfigured = {
  ok: false;
  reason: "not_configured";
  message: string;
};

export type GoogleAttributionOverviewError = {
  ok: false;
  reason: "api_error";
  message: string;
};

export type GoogleAttributionOverviewResponse =
  | GoogleAttributionOverviewOk
  | GoogleAttributionOverviewNotConfigured
  | GoogleAttributionOverviewError;

/**
 * GET /api/google-attribution/overview?range=7|14|30
 * Google Ads + GA4 campaign 级统一归因看板数据。
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const rangeDays = parseRangeDays(url.searchParams.get("range"));

  try {
    const result = await fetchUnifiedAttribution(session.shop, rangeDays);
    if (!result) {
      return Response.json({
        ok: false,
        reason: "not_configured",
        message: "请先连接 Google Ads 与 GA4 账户",
      } satisfies GoogleAttributionOverviewNotConfigured);
    }
    return Response.json({ ok: true, ...result } satisfies GoogleAttributionOverviewOk);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(
      `${LOG_PREFIX} shop=${session.shop} range=${rangeDays} ${formatOutboundErrorLog(e)}`,
    );
    return Response.json(
      { ok: false, reason: "api_error", message } satisfies GoogleAttributionOverviewError,
      { status: 500 },
    );
  }
};
