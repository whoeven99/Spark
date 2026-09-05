import type { ActionFunctionArgs } from "react-router";
import {
  claimAppUninstalled,
  completeAppUninstalled,
} from "../server/appLifecycle/onAppUninstalled.server";
import { runShopifyWebhookAction } from "../server/webhook/runShopifyWebhookAction.server";
import { runWebhookWorkInBackground } from "../server/webhook/runWebhookWork.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  return runShopifyWebhookAction(request, async ({ shop, session, topic, payload }) => {
    const webhookId = request.headers.get("X-Shopify-Webhook-Id") ?? undefined;
    const params = {
      shop,
      topic,
      payload,
      sessionId: session?.id,
      webhookId,
      uninstalledAt: new Date(),
    };

    // 先写幂等键再 200：Shopify 须 5s 内 ack。归档/清库/Partner/飞书放后台。
    // 整段 await 会超时重试；整段 fire-and-forget 曾在部署/冷切后 Account 残留。
    const claim = await claimAppUninstalled(params);
    runWebhookWorkInBackground(completeAppUninstalled(params, claim), {
      shop,
      topic,
      label: "app/uninstalled",
    });
  });
};
