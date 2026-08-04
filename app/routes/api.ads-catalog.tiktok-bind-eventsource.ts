import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getTiktokCatalogCredential,
  setTiktokCatalogCredential,
} from "../server/adsCatalog/credentialStore.server";
import {
  bindTiktokCatalogPixelEventSource,
  getTiktokEventSourceBindErrorCode,
} from "../server/adsCatalog/clients/tiktokCatalogClient.server";

const LOG_PREFIX = "[AdsCatalog][BindEventSource]";

/**
 * 为已连接的 TikTok Catalog 重新绑定 Pixel 事件源。
 * pixelCode 自动从凭证读取，无需前端传入。
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);

  const credential = await getTiktokCatalogCredential(session.shop);
  if (!credential) {
    return Response.json(
      { ok: false, error: "TikTok Catalog 尚未连接，请先完成授权。" },
      { status: 400 },
    );
  }
  if (!credential.bcId) {
    return Response.json(
      { ok: false, error: "缺少 bcId，请重新授权 TikTok。" },
      { status: 400 },
    );
  }
  if (!credential.pixelCode) {
    return Response.json(
      { ok: false, error: "当前 Catalog 没有关联 Pixel，请重新创建 Spark API 商品库。" },
      { status: 400 },
    );
  }

  try {
    const bindResult = await bindTiktokCatalogPixelEventSource({
      accessToken: credential.accessToken,
      advertiserId: credential.advertiserId,
      bcId: credential.bcId,
      catalogId: credential.catalogId,
      pixelCode: credential.pixelCode,
    });
    if (bindResult.advertiserId !== credential.advertiserId) {
      await setTiktokCatalogCredential(session.shop, {
        accessToken: credential.accessToken,
        refreshToken: credential.refreshToken,
        advertiserId: bindResult.advertiserId,
        bcId: credential.bcId,
        catalogId: credential.catalogId,
        catalogName: credential.catalogName,
        pixelCode: credential.pixelCode,
        appId: credential.appId,
      });
    }
    console.info(
      `${LOG_PREFIX} type=pixel shop=${session.shop} catalogId=${credential.catalogId} pixelCode=${credential.pixelCode} advertiserId=${bindResult.advertiserId} bound`,
    );
    return Response.json({
      ok: true,
      pixelCode: credential.pixelCode,
      advertiserId: bindResult.advertiserId,
    });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "绑定 Pixel 事件源失败";
    const errorCode = getTiktokEventSourceBindErrorCode(errMsg);
    console.error(`${LOG_PREFIX} type=pixel shop=${session.shop} err=${errMsg}`);
    return Response.json({ ok: false, error: errMsg, errorCode }, { status: 500 });
  }
};
