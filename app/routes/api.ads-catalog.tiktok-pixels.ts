import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  listTiktokPixels,
  type TiktokPixelListItem,
} from "../server/adsCatalog/clients/tiktokCatalogClient.server";
import {
  getTiktokCatalogCredential,
  getTiktokCatalogPending,
} from "../server/adsCatalog/credentialStore.server";
import {
  createEnumerationCache,
  parseRefreshFlag,
} from "../server/adsCatalog/enumerationCache.server";
import {
  listAuthorizedAdvertisers,
  type TiktokAuthorizedAdvertiser,
} from "../server/adsCatalog/tiktokOAuth.server";

// 广告主与 Pixel 都是下拉选项，打开面板就现拉没必要。
// Pixel 按 shop + advertiserId 分键，切换广告主不会串数据。
const advertisersCache = createEnumerationCache<TiktokAuthorizedAdvertiser[]>();
const pixelsCache = createEnumerationCache<TiktokPixelListItem[]>();

/**
 * 列出当前授权下的广告主，以及指定广告主下的 TikTok Pixel。
 * Query: advertiserId（可选；默认用已绑定凭证中的广告主）、refresh=0|1。
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const credential = await getTiktokCatalogCredential(shop);
  const pending = await getTiktokCatalogPending(shop);
  const accessToken = credential?.accessToken || pending?.accessToken;
  const boundAdvertiserId = credential?.advertiserId || pending?.advertiserId || "";

  if (!accessToken) {
    return Response.json(
      { ok: false, error: "请先完成 TikTok 授权" },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const requestedAdvertiserId = url.searchParams.get("advertiserId")?.trim() || "";
  const refresh = parseRefreshFlag(url.searchParams.get("refresh"));

  try {
    let advertisers = await advertisersCache
      .get(shop, () => listAuthorizedAdvertisers({ accessToken }), { refresh })
      .catch(() => []);
    if (advertisers.length === 0 && boundAdvertiserId) {
      advertisers = [{ advertiserId: boundAdvertiserId, advertiserName: boundAdvertiserId }];
    }

    const advertiserId =
      requestedAdvertiserId ||
      (advertisers.some((a) => a.advertiserId === boundAdvertiserId)
        ? boundAdvertiserId
        : advertisers[0]?.advertiserId) ||
      boundAdvertiserId;

    if (!advertiserId) {
      return Response.json(
        { ok: false, error: "请先完成 TikTok 授权" },
        { status: 400 },
      );
    }

    const pixels = await pixelsCache.get(
      `${shop}:${advertiserId}`,
      () => listTiktokPixels({ accessToken, advertiserId }),
      { refresh },
    );
    return Response.json({
      ok: true,
      advertisers,
      advertiserId,
      boundAdvertiserId,
      pixels,
      boundPixelCode: credential?.pixelCode ?? "",
    });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Failed to list TikTok pixels",
      },
      { status: 500 },
    );
  }
};
