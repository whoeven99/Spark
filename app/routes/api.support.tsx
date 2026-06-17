import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { fetchShopBasicInfo } from "../server/shopify/fetchShopBasicInfo.server";
import {
  appendShopMessage,
  getConversationForShop,
  setContactEmail,
} from "../server/support/supportStore.server";

/** 店主邮箱进程内缓存（邮箱稳定，避免每条消息都打一次 GraphQL）。 */
const SHOP_EMAIL_TTL_MS = 60 * 60 * 1000;
const shopEmailCache = new Map<string, { email: string | null; at: number }>();

async function resolveShopEmail(
  admin: Parameters<typeof fetchShopBasicInfo>[0],
  shop: string,
): Promise<string | null> {
  const cached = shopEmailCache.get(shop);
  if (cached && Date.now() - cached.at < SHOP_EMAIL_TTL_MS) {
    return cached.email;
  }
  let email: string | null = null;
  try {
    const info = await fetchShopBasicInfo(admin);
    email = info?.email?.trim() || info?.contactEmail?.trim() || null;
  } catch (error) {
    console.error("[api.support] fetchShopBasicInfo failed:", error);
  }
  shopEmailCache.set(shop, { email, at: Date.now() });
  return email;
}

/** 商家端客服面板：GET 拉取会话+消息（轮询），POST 发消息 / 留邮箱。 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const markSeen = new URL(request.url).searchParams.get("markSeen") === "true";
  // 读取不快照邮箱（避免每次轮询打 GraphQL）；快照在发消息/留邮箱时做。
  const conversation = await getConversationForShop(session.shop, null, {
    markSeen,
  });
  return Response.json({ ok: true, conversation });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const body = (await request.json().catch(() => ({}))) as {
    intent?: string;
    content?: string;
    email?: string;
  };

  try {
    if (body.intent === "setEmail") {
      const shopEmail = await resolveShopEmail(admin, session.shop);
      await setContactEmail(session.shop, body.email ?? "", shopEmail);
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
      const shopEmail = await resolveShopEmail(admin, session.shop);
      const message = await appendShopMessage(session.shop, content, shopEmail);
      return Response.json({ ok: true, message });
    }

    return Response.json(
      { ok: false, error: "unsupported intent" },
      { status: 400 },
    );
  } catch (error) {
    console.error("[api.support] action failed:", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "未知错误" },
      { status: 500 },
    );
  }
};
