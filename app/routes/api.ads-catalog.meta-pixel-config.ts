import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { saveMetaPixelConfig } from "../server/adsCatalog/metaPixelConfig.server";

/**
 * 保存 Meta Pixel 配置（Pixel ID + CAPI Token + 事件）。
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const { session, admin } = await authenticate.admin(request);

  let body: {
    pixelId?: unknown;
    capiAccessToken?: unknown;
    capiEnabled?: unknown;
    enabledEvents?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await saveMetaPixelConfig({
      shop: session.shop,
      admin,
      pixelId: typeof body.pixelId === "string" ? body.pixelId : undefined,
      capiAccessToken:
        typeof body.capiAccessToken === "string" ? body.capiAccessToken : undefined,
      capiEnabled: typeof body.capiEnabled === "boolean" ? body.capiEnabled : undefined,
      enabledEvents: body.enabledEvents,
    });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "保存 Meta Pixel 配置失败";
    const status =
      errMsg.includes("请") || errMsg.includes("required") || errMsg.includes("尚未")
        ? 400
        : 500;
    return Response.json({ ok: false, error: errMsg }, { status });
  }
};
