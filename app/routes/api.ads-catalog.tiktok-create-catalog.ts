import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { authenticate } from "../shopify.server";
import { ensureTiktokApiManagedCatalog } from "../server/adsCatalog/tiktokEnsureApiCatalog.server";
import { setTiktokCatalogRegionPreference } from "../server/adsCatalog/credentialStore.server";

const BodySchema = z.object({
  regionCode: z.string().min(2).max(4).optional(),
});

/**
 * 确保绑定 Spark API 可写 Catalog（无 pending 时也可用已连接凭证新建并切换）。
 * 创建时会同步：自动创建 TikTok Pixel 并关联 Catalog。
 */
export const action = async ({ request }: ActionFunctionArgs) => {
    if (request.method !== "POST") {
        return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
    }

    const { session, admin } = await authenticate.admin(request);
    const raw = (await request.json().catch(() => ({}))) as unknown;
    const parsed = BodySchema.safeParse(raw);
    const regionCode = parsed.success ? parsed.data.regionCode?.trim().toUpperCase() : undefined;

    try {
        if (regionCode) {
            await setTiktokCatalogRegionPreference(session.shop, regionCode);
        }
        const result = await ensureTiktokApiManagedCatalog({
            shop: session.shop,
            admin,
            ...(regionCode ? { regionCode } : {}),
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
