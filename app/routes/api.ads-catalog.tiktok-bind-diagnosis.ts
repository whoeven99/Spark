import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { diagnoseTiktokCatalogBind } from "../server/adsCatalog/tiktokCatalogBindDiagnosis.server";

/**
 * 只读：诊断 TikTok Catalog + Pixel 事件源绑定就绪情况。
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  try {
    const result = await diagnoseTiktokCatalogBind({
      shop: session.shop,
      admin,
    });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "绑定诊断失败",
      },
      { status: 500 },
    );
  }
};
