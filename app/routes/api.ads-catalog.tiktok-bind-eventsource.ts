import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getTiktokCatalogCredential,
  setTiktokCatalogCredential,
} from "../server/adsCatalog/credentialStore.server";
import { bindTiktokCatalogEventSource } from "../server/adsCatalog/clients/tiktokCatalogClient.server";

const LOG_PREFIX = "[AdsCatalog][BindEventSource]";

/**
 * 为已连接的 TikTok Catalog 绑定应用事件源（App ID）。
 * 仅支持已绑定 api_managed Catalog 的店铺；shopify_official 模式下同样支持绑定（不影响同步模式）。
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);

  let appId: string;
  try {
    const body = (await request.json()) as { appId?: unknown };
    appId = typeof body.appId === "string" ? body.appId.trim() : "";
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!appId) {
    return Response.json({ ok: false, error: "appId is required" }, { status: 400 });
  }

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

  try {
    await bindTiktokCatalogEventSource({
      accessToken: credential.accessToken,
      advertiserId: credential.advertiserId,
      bcId: credential.bcId,
      catalogId: credential.catalogId,
      appId,
    });

    await setTiktokCatalogCredential(session.shop, {
      accessToken: credential.accessToken,
      refreshToken: credential.refreshToken,
      advertiserId: credential.advertiserId,
      bcId: credential.bcId,
      catalogId: credential.catalogId,
      catalogName: credential.catalogName,
      pixelCode: credential.pixelCode,
      appId,
    });

    console.info(
      `${LOG_PREFIX} shop=${session.shop} catalogId=${credential.catalogId} appId=${appId} bound`,
    );
    return Response.json({ ok: true, appId });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "绑定应用事件源失败";
    console.error(`${LOG_PREFIX} shop=${session.shop} err=${errMsg}`);
    return Response.json({ ok: false, error: errMsg }, { status: 500 });
  }
};
