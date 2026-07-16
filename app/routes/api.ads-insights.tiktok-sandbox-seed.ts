import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  isTiktokSandboxConfigured,
  seedTiktokSandboxMinimalStructure,
} from "../server/adsInsights/tiktokSandbox.server";
import { formatOutboundErrorLog } from "../server/common/outboundError.server";

const LOG_PREFIX = "[AdsInsights][TikTok][SandboxSeed]";

/**
 * POST /api/ads-insights/tiktok-sandbox-seed
 * 在 TikTok 沙盒账户创建最小 Campaign → AdGroup → Image Ad + Video Ad（不使用 identity）。
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  if (request.method !== "POST") {
    return Response.json({ ok: false, message: "Method not allowed" }, { status: 405 });
  }

  if (!isTiktokSandboxConfigured()) {
    return Response.json(
      {
        ok: false,
        reason: "not_configured",
        message:
          "未配置 TikTok 沙盒环境变量 TIKTOK_SANDBOX_ACCESS_TOKEN / TIKTOK_SANDBOX_ADVERTISER_ID",
      },
      { status: 400 },
    );
  }

  try {
    const result = await seedTiktokSandboxMinimalStructure();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`${LOG_PREFIX} ${formatOutboundErrorLog(e)}`);
    return Response.json({ ok: false, reason: "api_error", message }, { status: 500 });
  }
};
