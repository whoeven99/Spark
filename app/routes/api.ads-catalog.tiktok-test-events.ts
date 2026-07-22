import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { testTiktokServerEvents } from "../server/adsCatalog/tiktokPixelConfig.server";

/**
 * 向当前 Pixel 发送一条测试 Events API 事件。
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);

  let testEventCode: string | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as { testEventCode?: unknown };
    testEventCode =
      typeof body.testEventCode === "string" && body.testEventCode.trim()
        ? body.testEventCode.trim()
        : undefined;
  } catch {
    testEventCode = undefined;
  }

  try {
    await testTiktokServerEvents({
      shop: session.shop,
      testEventCode,
    });
    return Response.json({ ok: true });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "测试事件发送失败";
    const status = errMsg.includes("请") || errMsg.includes("尚未") ? 400 : 500;
    return Response.json({ ok: false, error: errMsg }, { status });
  }
};
