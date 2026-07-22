import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { listTiktokPixels } from "../server/adsCatalog/clients/tiktokCatalogClient.server";
import {
  getTiktokCatalogCredential,
  getTiktokCatalogPending,
} from "../server/adsCatalog/credentialStore.server";

/**
 * 列出当前授权广告主下的 TikTok Pixel。
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const credential = await getTiktokCatalogCredential(shop);
  const pending = await getTiktokCatalogPending(shop);
  const accessToken = credential?.accessToken || pending?.accessToken;
  const advertiserId = credential?.advertiserId || pending?.advertiserId;

  if (!accessToken || !advertiserId) {
    return Response.json(
      { ok: false, error: "请先完成 TikTok 授权" },
      { status: 400 },
    );
  }

  try {
    const pixels = await listTiktokPixels({
      accessToken,
      advertiserId,
    });
    return Response.json({
      ok: true,
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
