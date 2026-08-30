import type { ActionFunctionArgs } from "react-router";
import { handleScopesUpdate } from "../server/commonEventLog/index.server";
import { runShopifyWebhookAction } from "../server/webhook/runShopifyWebhookAction.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  return runShopifyWebhookAction(request, async ({ shop, session, topic, payload }) => {
    try {
      await handleScopesUpdate({
        shop,
        topic,
        payload,
        sessionId: session?.id,
      });
    } catch (error) {
      console.error("[CommonEvent] app/scopes_update handler failed:", error);
    }
  });
};
