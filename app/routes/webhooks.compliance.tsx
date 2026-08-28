import type { ActionFunctionArgs } from "react-router";
import { handleComplianceWebhook } from "../server/webhook/complianceWebhooks.server";
import {
  authenticateWebhookLogged,
  returnWebhookOk,
} from "../server/webhook/webhookDebugLog.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticateWebhookLogged(request);
  const webhookId = request.headers.get("X-Shopify-Webhook-Id") ?? undefined;
  const result = handleComplianceWebhook({
    shop,
    topic,
    payload,
    webhookId,
  });

  if (!result.handled) {
    return new Response("Unhandled webhook topic", { status: 404 });
  }

  return returnWebhookOk({ shop, topic });
};
