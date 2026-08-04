import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getGoogleAdsSandboxCredential } from "../server/adsCatalog/credentialStore.server";
import { seedGoogleAdsSandboxFullStructure } from "../server/adsInsights/googleSandbox.server";
import { formatOutboundErrorLog } from "../server/common/outboundError.server";

const LOG_PREFIX = "[AdsInsights][Google][SandboxSeed]";

/**
 * POST /api/ads-insights/google-sandbox-seed
 * 在 Google Ads 测试账号创建 Budget → Campaign → AdGroup → Ad → Keyword。
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  if (request.method !== "POST") {
    return Response.json({ ok: false, message: "Method not allowed" }, { status: 405 });
  }

  const cred = await getGoogleAdsSandboxCredential(session.shop);
  if (!cred) {
    return Response.json(
      {
        ok: false,
        reason: "not_configured",
        message: "Google Ads 测试账号未授权，请先完成 OAuth 并选择测试客户账户",
      },
      { status: 400 },
    );
  }

  try {
    const result = await seedGoogleAdsSandboxFullStructure(session.shop);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`${LOG_PREFIX} ${formatOutboundErrorLog(e)}`);
    return Response.json({ ok: false, reason: "api_error", message }, { status: 500 });
  }
};
