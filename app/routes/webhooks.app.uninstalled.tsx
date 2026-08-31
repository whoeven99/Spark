import type { ActionFunctionArgs } from "react-router";
import { onAppUninstalled } from "../server/appLifecycle/onAppUninstalled.server";
import { runShopifyWebhookAction } from "../server/webhook/runShopifyWebhookAction.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  return runShopifyWebhookAction(request, async ({ shop, session, topic, payload }) => {
    const webhookId = request.headers.get("X-Shopify-Webhook-Id") ?? undefined;

    // 必须 await：清库是合规关键路径。fire-and-forget 在部署/冷切时会被掐掉，
    // 导致 Account 残留（测环境已复现）。
    await onAppUninstalled({
      shop,
      topic,
      payload,
      sessionId: session?.id,
      webhookId,
      uninstalledAt: new Date(),
    });
  });
};
