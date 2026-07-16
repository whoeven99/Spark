import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { buildGoogleAdsSandboxOAuthStartUrl } from "../server/adsCatalog/googleOAuth.server";

/**
 * GET /api/ads-insights/google-sandbox-auth-url
 * 启动 Google Ads 测试账号 OAuth（与 Catalog 生产授权隔离）。
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const source = new URL(request.url);
  const host = source.searchParams.get("host") ?? "";
  const reauth = source.searchParams.get("reauth") === "1";

  const result = buildGoogleAdsSandboxOAuthStartUrl({
    shop: session.shop,
    host,
    requestOrigin: source.origin,
    reauth,
  });

  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }
  return Response.json({ ok: true, authUrl: result.authUrl });
};
