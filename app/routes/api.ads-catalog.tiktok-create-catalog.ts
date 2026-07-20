import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureTiktokApiManagedCatalog } from "../server/adsCatalog/tiktokEnsureApiCatalog.server";

/**
 * Path B：确保绑定 Spark API 可写 Catalog（无 pending 时也可用已连接凭证新建并切换）。
 * 创建时会同步：自动创建 TikTok Pixel 并关联 Catalog；若提供 appId 则同时绑定应用事件源。
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const { session, admin } = await authenticate.admin(request);

  let appId: string | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as { appId?: unknown };
    if (typeof body.appId === "string" && body.appId.trim()) {
      appId = body.appId.trim();
    }
  } catch {
    // 忽略 JSON 解析失败，appId 保持 undefined
  }

  try {
    const result = await ensureTiktokApiManagedCatalog({
      shop: session.shop,
      admin,
      appId,
    });
    return Response.json({
      ok: true,
      catalogId: result.catalogId,
      catalogName: result.catalogName,
      created: result.created,
      bindingMode: result.bindingMode,
      pixelCode: result.pixelCode ?? null,
    });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Failed to create TikTok catalog",
      },
      { status: 500 },
    );
  }
};
