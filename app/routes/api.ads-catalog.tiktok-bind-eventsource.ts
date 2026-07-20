import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getTiktokCatalogCredential,
  setTiktokCatalogCredential,
} from "../server/adsCatalog/credentialStore.server";
import { bindTiktokCatalogEventSource } from "../server/adsCatalog/clients/tiktokCatalogClient.server";

const LOG_PREFIX = "[AdsCatalog][BindEventSource]";

/**
 * 为已连接的 TikTok Catalog 绑定事件源。
 * - type="app"（默认）：绑定 App 事件源，body 中必须提供 appId。
 * - type="pixel"：重新绑定 Pixel 事件源，pixelCode 自动从凭证读取，无需前端传入。
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);

  let type: "app" | "pixel";
  let appId: string;
  try {
    const body = (await request.json()) as { type?: unknown; appId?: unknown };
    type = body.type === "pixel" ? "pixel" : "app";
    appId = typeof body.appId === "string" ? body.appId.trim() : "";
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (type === "app" && !appId) {
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

  if (type === "pixel") {
    if (!credential.pixelCode) {
      return Response.json(
        { ok: false, error: "当前 Catalog 没有关联 Pixel，请重新创建 Spark API 商品库。" },
        { status: 400 },
      );
    }

    try {
      await bindTiktokCatalogEventSource({
        accessToken: credential.accessToken,
        advertiserId: credential.advertiserId,
        bcId: credential.bcId,
        catalogId: credential.catalogId,
        pixelCode: credential.pixelCode,
      });
      console.info(
        `${LOG_PREFIX} type=pixel shop=${session.shop} catalogId=${credential.catalogId} pixelCode=${credential.pixelCode} bound`,
      );
      return Response.json({ ok: true, pixelCode: credential.pixelCode });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "绑定 Pixel 事件源失败";
      console.error(`${LOG_PREFIX} type=pixel shop=${session.shop} err=${errMsg}`);
      return Response.json({ ok: false, error: errMsg }, { status: 500 });
    }
  }

  // type === "app"
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
      `${LOG_PREFIX} type=app shop=${session.shop} catalogId=${credential.catalogId} appId=${appId} bound`,
    );
    return Response.json({ ok: true, appId });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "绑定应用事件源失败";
    console.error(`${LOG_PREFIX} type=app shop=${session.shop} err=${errMsg}`);
    return Response.json({ ok: false, error: errMsg }, { status: 500 });
  }
};
