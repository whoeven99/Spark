import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  isMetaSandboxConfigured,
  seedMetaSandboxMinimalStructure,
} from "../server/adsInsights/metaSandbox.server";
import { formatOutboundErrorLog } from "../server/common/outboundError.server";

const LOG_PREFIX = "[AdsInsights][Meta][SandboxSeed]";

/**
 * POST /api/ads-insights/meta-sandbox-seed
 * 在 Meta 沙盒广告账户创建 Campaign → Ad Set → Ad（需 Page；指标来自真实 Insights API）。
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  if (request.method !== "POST") {
    return Response.json({ ok: false, message: "Method not allowed" }, { status: 405 });
  }

  if (!isMetaSandboxConfigured()) {
    return Response.json(
      {
        ok: false,
        reason: "not_configured",
        message:
          "未配置 Meta 沙盒环境变量 META_SANDBOX_ACCESS_TOKEN / META_SANDBOX_AD_ACCOUNT_ID",
      },
      { status: 400 },
    );
  }

  try {
    const result = await seedMetaSandboxMinimalStructure();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`${LOG_PREFIX} ${formatOutboundErrorLog(e)}`);
    return Response.json({ ok: false, reason: "api_error", message }, { status: 500 });
  }
};
