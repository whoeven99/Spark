import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { resolveClientIpFromHeaders } from "../server/adsCatalog/clients/metaConversionsApiClient.server";
import {
  clearMetaPixelTestEventMode,
  startMetaPixelTestEventMode,
  testMetaServerEvents,
} from "../server/adsCatalog/metaPixelConfig.server";

type TestEventAction = "send" | "start" | "clear";

/**
 * Meta Test Event Code：
 * - send：发送一条带 test_event_code 的连通性测试事件
 * - start：写入凭证 + metafield，开启测试模式
 * - clear：清除凭证与 metafield 中的 Test Event Code
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const { session, admin } = await authenticate.admin(request);

  let actionKind: TestEventAction = "send";
  let testEventCode = "";
  let capiAccessToken: string | undefined;
  let pixelId: string | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      testEventCode?: unknown;
      capiAccessToken?: unknown;
      pixelId?: unknown;
    };
    const rawAction = typeof body.action === "string" ? body.action.trim() : "send";
    actionKind =
      rawAction === "start" || rawAction === "clear" || rawAction === "send"
        ? rawAction
        : "send";
    testEventCode =
      typeof body.testEventCode === "string" ? body.testEventCode.trim() : "";
    capiAccessToken =
      typeof body.capiAccessToken === "string" && body.capiAccessToken.trim()
        ? body.capiAccessToken.trim()
        : undefined;
    pixelId =
      typeof body.pixelId === "string" && body.pixelId.trim()
        ? body.pixelId.trim()
        : undefined;
  } catch {
    testEventCode = "";
    actionKind = "send";
  }

  try {
    if (actionKind === "clear") {
      await clearMetaPixelTestEventMode({ shop: session.shop, admin });
      return Response.json({ ok: true, action: "clear" });
    }

    if (!testEventCode) {
      return Response.json(
        { ok: false, error: "请填写 Test Event Code" },
        { status: 400 },
      );
    }

    if (actionKind === "start") {
      await startMetaPixelTestEventMode({
        shop: session.shop,
        admin,
        testEventCode,
      });
      return Response.json({ ok: true, action: "start" });
    }

    await testMetaServerEvents({
      shop: session.shop,
      testEventCode,
      capiAccessToken,
      pixelId,
      clientIpAddress: resolveClientIpFromHeaders(request.headers),
      clientUserAgent: request.headers.get("user-agent")?.trim() || undefined,
    });
    return Response.json({ ok: true, action: "send" });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "测试事件操作失败";
    const status = errMsg.includes("请") || errMsg.includes("尚未") ? 400 : 500;
    return Response.json({ ok: false, error: errMsg }, { status });
  }
};
