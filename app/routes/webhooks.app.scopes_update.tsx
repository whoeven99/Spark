import type { ActionFunctionArgs } from "react-router";
import { handleScopesUpdate } from "../server/commonEventLog/index.server";
import {
  authenticateWebhookLogged,
  returnWebhookOk,
} from "../server/webhook/webhookDebugLog.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic, payload } =
    await authenticateWebhookLogged(request);

  try {
    await handleScopesUpdate({
      shop,
      topic,
      payload,
      sessionId: session?.id,
    });
  } catch (error) {
    console.error("[CommonEvent] app/scopes_update handler failed:", error);
    throw error;
  }

  return returnWebhookOk({ shop, topic });
};
