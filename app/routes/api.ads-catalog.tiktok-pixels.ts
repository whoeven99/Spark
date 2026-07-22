import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { listTiktokPixels } from "../server/adsCatalog/clients/tiktokCatalogClient.server";
import {
  getTiktokCatalogCredential,
  getTiktokCatalogPending,
} from "../server/adsCatalog/credentialStore.server";
import { listAuthorizedAdvertisers } from "../server/adsCatalog/tiktokOAuth.server";

/**
 * 列出当前授权下的广告主，以及指定广告主下的 TikTok Pixel。
 * Query: advertiserId（可选；默认用已绑定凭证中的广告主）。
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

  try {
    let advertisers = await listAuthorizedAdvertisers({ accessToken }).catch(() => []);
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

    const pixels = await listTiktokPixels({
      accessToken,
      advertiserId,
    });
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
