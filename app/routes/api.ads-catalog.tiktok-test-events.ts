import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { testTiktokServerEvents } from "../server/adsCatalog/tiktokPixelConfig.server";

/**
 * 向当前 Pixel 发送一条带 test_event_code 的测试 Events API 事件，用于验证连通性。
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);

  let testEventCode = "";
  let eventsApiAccessToken: string | undefined;
  let pixelCode: string | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      testEventCode?: unknown;
      eventsApiAccessToken?: unknown;
      pixelCode?: unknown;
    };
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
  }

  if (!testEventCode) {
    return Response.json(
      { ok: false, error: "请填写 Test Event Code" },
      { status: 400 },
    );
  }

  try {
    await testTiktokServerEvents({
      shop: session.shop,
      testEventCode,
      eventsApiAccessToken,
      pixelCode,
    });
    return Response.json({ ok: true });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "测试事件发送失败";
    const status = errMsg.includes("请") || errMsg.includes("尚未") ? 400 : 500;
    return Response.json({ ok: false, error: errMsg }, { status });
  }
};
