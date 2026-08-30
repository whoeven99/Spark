import type { ActionFunctionArgs } from "react-router";
import { onAppUninstalled } from "../server/appLifecycle/onAppUninstalled.server";
import { runWebhookWorkInBackground } from "../server/webhook/runWebhookWork.server";
import { runShopifyWebhookAction } from "../server/webhook/runShopifyWebhookAction.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  return runShopifyWebhookAction(request, async ({ shop, session, topic, payload }) => {
    const webhookId = request.headers.get("X-Shopify-Webhook-Id") ?? undefined;

    runWebhookWorkInBackground(
      onAppUninstalled({
        shop,
        topic,
        payload,
        sessionId: session?.id,
        webhookId,
        uninstalledAt: new Date(),
      }),
      { shop, topic, label: "app/uninstalled" },
    );
  });
};
