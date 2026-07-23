import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { authenticate } from "../shopify.server";
import { setTiktokCatalogRegionPreference } from "../server/adsCatalog/credentialStore.server";
import { assertTiktokCatalogAutoCreateRegion } from "../server/adsCatalog/clients/tiktokCatalogClient.server";

const BodySchema = z.object({
  regionCode: z.string().min(2).max(4),
});

/** 保存 TikTok Catalog 目标市场偏好（覆盖店铺推断区域）。 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);
  const raw = (await request.json().catch(() => ({}))) as unknown;
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  const regionCode = parsed.data.regionCode.trim().toUpperCase();
  try {
    assertTiktokCatalogAutoCreateRegion(regionCode);
    await setTiktokCatalogRegionPreference(session.shop, regionCode);
    return Response.json({ ok: true, regionCode });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to save region" },
      { status: 400 },
    );
  }
};
