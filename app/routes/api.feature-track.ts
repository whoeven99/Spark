import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { recordFeatureTrack } from "../server/aliyunLog/featureTrack.server";

/**
 * 嵌入式 App 功能埋点路由。
 *
 * - 走 `authenticate.admin` 鉴权，shop 以服务端 session 为准（前端不可伪造）；
 * - 写入失败/校验失败一律返回 200 `{ ok: true }`，埋点绝不阻断用户操作；
 * - 仅接受 POST。
 */

function jsonOk() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return jsonOk();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonOk();
  }

  const input = (body ?? {}) as {
    feature?: unknown;
    action?: unknown;
    path?: unknown;
    extra?: unknown;
  };

  try {
    await recordFeatureTrack({
      shop: session.shop,
      feature: typeof input.feature === "string" ? input.feature : "",
      action: typeof input.action === "string" ? input.action : "",
      path: typeof input.path === "string" ? input.path : undefined,
      extra:
        input.extra && typeof input.extra === "object"
          ? (input.extra as Record<string, unknown>)
          : undefined,
    });
  } catch (err) {
    console.warn("[feature-track] record failed:", err);
  }

  return jsonOk();
};
