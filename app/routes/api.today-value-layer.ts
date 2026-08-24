/** GET /api/today-value-layer — 诊断页价值层（成本口径 / 客户价值 / 渠道 ROI）。 */
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  loadValueLayer,
  type ValueLayerData,
} from "../server/operations/valueLayer.server";

export type ValueLayerResponse =
  | { ok: true; value: ValueLayerData }
  | { ok: false; error: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  try {
    const value = await loadValueLayer(admin, session.shop, {
      countryCode: url.searchParams.get("country"),
    });
    return Response.json({ ok: true, value } satisfies ValueLayerResponse);
  } catch (error) {
    console.error("[daily-operations] value layer failed:", error);
    return Response.json(
      { ok: false, error: "价值层数据加载失败" } satisfies ValueLayerResponse,
      { status: 500 },
    );
  }
};
