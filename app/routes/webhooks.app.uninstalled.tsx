import type { ActionFunctionArgs } from "react-router";
import { onAppUninstalled } from "../server/appLifecycle/onAppUninstalled.server";
import { runShopifyWebhookAction } from "../server/webhook/runShopifyWebhookAction.server";

/**
 * app/uninstalled：鉴权后立刻 200。
 *
 * Shopify 要求 5 秒内响应；归档+清库+飞书/邮件常超过该上限，若 await 整条链路，
 * 会被判失败并重试，从而重复通知。重活放到响应之后异步执行。
 *
 * 风险：进程在异步完成前被部署掐掉时，清库可能未跑完；后续 shop/redact 仍会幂等清理。
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  return runShopifyWebhookAction(request, async ({ shop, session, topic, payload }) => {
    const webhookId = request.headers.get("X-Shopify-Webhook-Id") ?? undefined;

    void onAppUninstalled({
      shop,
      topic,
      payload,
      sessionId: session?.id,
      webhookId,
      uninstalledAt: new Date(),
    }).catch((error) => {
      console.error(`[Webhook] app/uninstalled async failed shop=${shop}`, error);
    });
  });
};
