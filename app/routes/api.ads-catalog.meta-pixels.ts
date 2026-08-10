import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  createEnumerationCache,
  parseRefreshFlag,
} from "../server/adsCatalog/enumerationCache.server";
import { listMetaCatalogPixels } from "../server/adsCatalog/metaPixelConfig.server";
import type { MetaPixelListItem } from "../server/adsCatalog/clients/facebookGraphClient.server";

const pixelsCache = createEnumerationCache<{
  pixels: MetaPixelListItem[];
  adAccounts: Array<{ id: string; name?: string; formatted?: string }>;
  adAccountId: string;
  boundAdAccountId: string;
  boundPixelId: string;
  pixelSource: "meta_ads" | "business" | "catalog_ad_accounts" | "none";
  needsMetaAdsConnect: boolean;
  listError?: string;
}>();

/**
 * 列举 Meta Pixel 下拉选项。
 * Query: adAccountId（可选）、refresh=0|1。
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const requestedAdAccountId = url.searchParams.get("adAccountId")?.trim() || "";
  const refresh = parseRefreshFlag(url.searchParams.get("refresh"));

  try {
    const result = await pixelsCache.get(
      `${shop}:${requestedAdAccountId}`,
      () =>
        listMetaCatalogPixels({
          shop,
          adAccountId: requestedAdAccountId || undefined,
        }),
      { refresh },
    );

    if (result.listError === "no_credential") {
      return Response.json(
        { ok: false, error: "请先完成 Meta Catalog 授权" },
        { status: 400 },
      );
    }

    return Response.json({
      ok: true,
      pixels: result.pixels,
      adAccounts: result.adAccounts,
      adAccountId: result.adAccountId,
      boundAdAccountId: result.boundAdAccountId,
      boundPixelId: result.boundPixelId,
      pixelSource: result.pixelSource,
      needsMetaAdsConnect: result.needsMetaAdsConnect,
      listError: result.listError,
    });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Failed to list Meta pixels",
      },
      { status: 500 },
    );
  }
};
