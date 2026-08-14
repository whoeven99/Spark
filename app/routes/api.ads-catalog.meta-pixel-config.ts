import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { saveMetaPixelConfig } from "../server/adsCatalog/metaPixelConfig.server";
import { formatMetaCapiTokenForLog } from "../server/adsCatalog/metaCapiLog.server";

const LOG_PREFIX = "[AdsCatalog][MetaPixelConfigAPI]";

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
    forceFetchCapiToken?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const pixelId = typeof body.pixelId === "string" ? body.pixelId.trim() : "";
  const capiAccessToken =
    typeof body.capiAccessToken === "string" ? body.capiAccessToken.trim() : "";
  const forceFetchCapiToken = body.forceFetchCapiToken === true;
  const capiEnabled = typeof body.capiEnabled === "boolean" ? body.capiEnabled : undefined;

  console.info(
    `${LOG_PREFIX} step=request shop=${session.shop} forceFetchCapiToken=${forceFetchCapiToken} pixelId=${pixelId} capiEnabled=${capiEnabled ?? ""} capiAccessToken=${capiAccessToken ? formatMetaCapiTokenForLog(capiAccessToken) : ""} enabledEvents=${Array.isArray(body.enabledEvents) ? JSON.stringify(body.enabledEvents) : ""}`,
  );

  try {
    const result = await saveMetaPixelConfig({
      shop: session.shop,
      admin,
      pixelId: pixelId || undefined,
      capiAccessToken: capiAccessToken || undefined,
      capiEnabled,
      enabledEvents: body.enabledEvents,
      forceFetchCapiToken,
    });
    console.info(
      `${LOG_PREFIX} step=success shop=${session.shop} pixelId=${result.pixelId} hasCapiAccessToken=${result.hasCapiAccessToken} capiEnabled=${result.capiEnabled}`,
    );
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "保存 Meta Pixel 配置失败";
    console.error(
      `${LOG_PREFIX} step=failed shop=${session.shop} forceFetchCapiToken=${forceFetchCapiToken} pixelId=${pixelId} err=${errMsg}`,
    );
    const status =
      errMsg.includes("请") || errMsg.includes("required") || errMsg.includes("尚未")
        ? 400
        : 500;
    return Response.json({ ok: false, error: errMsg }, { status });
  }
};
