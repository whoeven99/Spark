import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureTiktokApiManagedCatalog } from "../server/adsCatalog/tiktokEnsureApiCatalog.server";

/**
 * Path B：确保绑定 Spark API 可写 Catalog（无 pending 时也可用已连接凭证新建并切换）。
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const { session, admin } = await authenticate.admin(request);

  try {
    const result = await ensureTiktokApiManagedCatalog({
      shop: session.shop,
      admin,
    });
    return Response.json({
      ok: true,
      catalogId: result.catalogId,
      catalogName: result.catalogName,
      created: result.created,
      bindingMode: result.bindingMode,
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
