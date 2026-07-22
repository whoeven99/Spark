import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getTiktokEventSourceBindErrorCode } from "../server/adsCatalog/clients/tiktokCatalogClient.server";
import { saveTiktokPixelConfig } from "../server/adsCatalog/tiktokPixelConfig.server";

/**
 * 保存 TikTok Pixel 绑定配置（选已有 / 创建 + Events API token + 事件勾选）。
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const { session, admin } = await authenticate.admin(request);

  let body: {
    mode?: unknown;
    advertiserId?: unknown;
    pixelCode?: unknown;
    pixelName?: unknown;
    eventsApiAccessToken?: unknown;
    eventsApiEnabled?: unknown;
    enabledEvents?: unknown;
    bindCatalogEventSource?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const mode = body.mode === "create" ? "create" : "select";

  try {
    const result = await saveTiktokPixelConfig({
      shop: session.shop,
      admin,
      mode,
      advertiserId:
        typeof body.advertiserId === "string" ? body.advertiserId : undefined,
      pixelCode: typeof body.pixelCode === "string" ? body.pixelCode : undefined,
      pixelName: typeof body.pixelName === "string" ? body.pixelName : undefined,
      eventsApiAccessToken:
        typeof body.eventsApiAccessToken === "string"
          ? body.eventsApiAccessToken
          : undefined,
      eventsApiEnabled:
        typeof body.eventsApiEnabled === "boolean" ? body.eventsApiEnabled : undefined,
      enabledEvents: body.enabledEvents,
      bindCatalogEventSource:
        typeof body.bindCatalogEventSource === "boolean"
          ? body.bindCatalogEventSource
          : undefined,
    });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "保存 Pixel 配置失败";
    const errorCode = getTiktokEventSourceBindErrorCode(errMsg);
    const status =
      errMsg.includes("请") || errMsg.includes("required") || errMsg.includes("尚未")
        ? 400
        : 500;
    return Response.json({ ok: false, error: errMsg, errorCode }, { status });
  }
};
