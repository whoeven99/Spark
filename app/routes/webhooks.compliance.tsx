import type { ActionFunctionArgs } from "react-router";
import { handleComplianceWebhook } from "../server/webhook/complianceWebhooks.server";
import { runShopifyWebhookAction } from "../server/webhook/runShopifyWebhookAction.server";
import { returnWebhookOk } from "../server/webhook/webhookDebugLog.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  return runShopifyWebhookAction(request, async ({ shop, topic, payload }) => {
    const webhookId = request.headers.get("X-Shopify-Webhook-Id") ?? undefined;
    const result = await handleComplianceWebhook({
      shop,
      topic,
      payload,
      webhookId,
    });

    if (!result.handled) {
      console.warn(
        `[Webhook] compliance unhandled shop=${shop} topic=${topic} (ack 200)`,
      );
    }

    return returnWebhookOk({ shop, topic });
  });
};
