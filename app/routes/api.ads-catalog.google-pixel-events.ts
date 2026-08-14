import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { loadGooglePixelActivityEvents } from "../server/aliyunLog/googlePixelActivity.server";

/**
 * GET /api/ads-catalog/google-pixel-events
 * 查询参数：range / event / keyword / page / pageSize / from / to
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? 1) || 1;
  const pageSize = Number(url.searchParams.get("pageSize") ?? 50) || 50;
  const from = Number(url.searchParams.get("from") ?? 0) || undefined;
  const to = Number(url.searchParams.get("to") ?? 0) || undefined;

  const result = await loadGooglePixelActivityEvents({
    shop: session.shop,
    range: url.searchParams.get("range"),
    event: url.searchParams.get("event"),
    keyword: url.searchParams.get("keyword"),
    page,
    pageSize,
    fromMs: from,
    toMs: to,
  });
  return Response.json({ ok: true, ...result });
};
