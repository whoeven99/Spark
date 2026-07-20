import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureTiktokCatalogPixel } from "../server/adsCatalog/ensureTiktokCatalogPixel.server";

/**
 * 为已连接的 TikTok Catalog 创建（若缺失）并绑定 Pixel 事件源。
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const { session, admin } = await authenticate.admin(request);

  try {
    const result = await ensureTiktokCatalogPixel({
      shop: session.shop,
      admin,
    });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "创建或绑定 Pixel 失败",
      },
      { status: 500 },
    );
  }
};
