import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { fetchAdsInsights } from "../server/adsInsights/index.server";
import { parseRangeDays } from "../server/adsInsights/dateRange.server";
import {
  parseAdsInsightsView,
  type AdsInsightsPlatform,
} from "../server/adsInsights/types.server";
import { formatOutboundErrorLog } from "../server/common/outboundError.server";

const LOG_PREFIX = "[AdsInsights][API]";

function parsePlatform(raw: string | null): AdsInsightsPlatform | null {
  if (raw === "meta" || raw === "google" || raw === "tiktok") return raw;
  return null;
}

function parseSandbox(raw: string | null): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * GET /api/ads-insights?platform=meta|google|tiktok&range=7|14|30&view=structure|keywords|searchTerms|creatives&sandbox=0|1
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const platform = parsePlatform(url.searchParams.get("platform"));
  const rangeDays = parseRangeDays(url.searchParams.get("range"));
  const view = parseAdsInsightsView(url.searchParams.get("view"));
  const sandbox = parseSandbox(url.searchParams.get("sandbox"));

  if (!platform) {
    return Response.json(
      { ok: false, reason: "invalid_platform", message: "platform 必须是 meta / google / tiktok" },
      { status: 400 },
    );
  }

  if (sandbox && platform !== "tiktok") {
    return Response.json(
      { ok: false, reason: "invalid_sandbox", message: "sandbox 仅支持 platform=tiktok" },
      { status: 400 },
    );
  }

  try {
    const result = await fetchAdsInsights({
      shop: session.shop,
      platform,
      rangeDays,
      view,
      sandbox,
    });
    if (!result) {
      return Response.json({
        ok: false,
        reason: "not_configured",
        message: sandbox
          ? "TikTok 沙盒未配置：请设置 TIKTOK_SANDBOX_ACCESS_TOKEN 与 TIKTOK_SANDBOX_ADVERTISER_ID"
          : platform === "meta"
            ? "Meta Ads 账户未绑定，请先完成独立授权"
            : platform === "google"
              ? "Google Ads 账户未绑定或缺少 developer token"
              : "TikTok Ads 账户未绑定，请先在 Catalog 页完成授权",
      });
    }
    return Response.json({ ok: true, view, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(
      `${LOG_PREFIX} platform=${platform} view=${view} sandbox=${sandbox} shop=${session.shop} ${formatOutboundErrorLog(e)}`,
    );
    return Response.json({ ok: false, reason: "api_error", message }, { status: 500 });
  }
};
