import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  clearTiktokPixelTestEventMode,
  startTiktokPixelTestEventMode,
  testTiktokServerEvents,
} from "../server/adsCatalog/tiktokPixelConfig.server";

type TestEventAction = "send" | "start" | "clear";

/**
 * TikTok Test Event Code：
 * - send：发送一条带 test_event_code 的连通性测试事件
 * - start：写入凭证 + metafield，开启测试模式（店面 ttq / CompletePayment）
 * - clear：清除凭证与 metafield 中的 Test Event Code，恢复正式事件
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const { session, admin } = await authenticate.admin(request);

  let actionKind: TestEventAction = "send";
  let testEventCode = "";
  let eventsApiAccessToken: string | undefined;
  let pixelCode: string | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      testEventCode?: unknown;
      eventsApiAccessToken?: unknown;
      pixelCode?: unknown;
    };
    const rawAction = typeof body.action === "string" ? body.action.trim() : "send";
    actionKind =
      rawAction === "start" || rawAction === "clear" || rawAction === "send"
        ? rawAction
        : "send";
    testEventCode =
      typeof body.testEventCode === "string" ? body.testEventCode.trim() : "";
    eventsApiAccessToken =
      typeof body.eventsApiAccessToken === "string" && body.eventsApiAccessToken.trim()
        ? body.eventsApiAccessToken.trim()
        : undefined;
    pixelCode =
      typeof body.pixelCode === "string" && body.pixelCode.trim()
        ? body.pixelCode.trim()
        : undefined;
  } catch {
    testEventCode = "";
    actionKind = "send";
  }

  try {
    if (actionKind === "clear") {
      await clearTiktokPixelTestEventMode({ shop: session.shop, admin });
      return Response.json({ ok: true, action: "clear" });
    }

    if (!testEventCode) {
      return Response.json(
        { ok: false, error: "请填写 Test Event Code" },
        { status: 400 },
      );
    }

    if (actionKind === "start") {
      await startTiktokPixelTestEventMode({
        shop: session.shop,
        admin,
        testEventCode,
      });
      return Response.json({ ok: true, action: "start" });
    }

    await testTiktokServerEvents({
      shop: session.shop,
      testEventCode,
      eventsApiAccessToken,
      pixelCode,
    });
    return Response.json({ ok: true, action: "send" });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "测试事件操作失败";
    const status = errMsg.includes("请") || errMsg.includes("尚未") ? 400 : 500;
    return Response.json({ ok: false, error: errMsg }, { status });
  }
};
