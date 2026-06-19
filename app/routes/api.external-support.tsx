import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  appendShopMessage,
  getConversationForShop,
  setContactEmail,
} from "../server/support/supportStore.server";

/**
 * 外部应用（tsf 翻译v4）客服消息入口：用 shared-secret 鉴权，不走 Shopify。
 * GET  /api/external-support?shop=&source=&markSeen=  —— 拉会话+消息
 * POST /api/external-support  { intent: "send" | "setEmail", shop, source, content?, email? }
 */

/** 允许的外部来源白名单（Spark 自身 "spark" 不经此入口）。 */
const ALLOWED_SOURCES = new Set(["translate-v4"]);

function authorized(request: Request): boolean {
  const secret = process.env.EXTERNAL_SUPPORT_SECRET?.trim();
  if (!secret) return false; // 未配置则一律拒绝，避免裸奔
  return request.headers.get("x-support-secret") === secret;
}

function resolveSource(raw: string | null | undefined): string | null {
  const source = (raw ?? "").trim();
  return ALLOWED_SOURCES.has(source) ? source : null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop")?.trim();
  const source = resolveSource(url.searchParams.get("source"));
  const markSeen = url.searchParams.get("markSeen") === "true";
  if (!shop || !source) {
    return Response.json(
      { ok: false, error: "shop and valid source required" },
      { status: 400 },
    );
  }
  const conversation = await getConversationForShop(shop, null, { markSeen }, source);
  return Response.json({ ok: true, conversation });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    intent?: string;
    shop?: string;
    source?: string;
    content?: string;
    email?: string;
  };

  const shop = body.shop?.trim();
  const source = resolveSource(body.source);
  if (!shop || !source) {
    return Response.json(
      { ok: false, error: "shop and valid source required" },
      { status: 400 },
    );
  }

  try {
    if (body.intent === "setEmail") {
      // 外部来源无 Shopify admin，shopEmail 由调用方在 email 内自带（这里只存 contactEmail）
      await setContactEmail(shop, body.email ?? "", null, source);
      return Response.json({ ok: true });
    }

    if (body.intent === "send") {
      const content = body.content ?? "";
      if (!content.trim()) {
        return Response.json(
          { ok: false, error: "消息内容不能为空" },
          { status: 400 },
        );
      }
      const message = await appendShopMessage(shop, content, null, source);
      return Response.json({ ok: true, message });
    }

    return Response.json(
      { ok: false, error: "unsupported intent" },
      { status: 400 },
    );
  } catch (error) {
    console.error("[api.external-support] action failed:", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "未知错误" },
      { status: 500 },
    );
  }
};
