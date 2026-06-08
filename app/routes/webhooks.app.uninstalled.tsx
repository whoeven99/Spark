import type { ActionFunctionArgs } from "react-router";
import { onAppUninstalled } from "../server/appLifecycle/onAppUninstalled.server";
import {
  authenticateWebhookLogged,
  returnWebhookOk,
} from "../server/webhook/webhookDebugLog.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  let shop: string;
  let session: Awaited<
    ReturnType<typeof authenticateWebhookLogged>
  >["session"];
  let topic: string;
  let payload: unknown;

  try {
    ({ shop, session, topic, payload } = await authenticateWebhookLogged(request));
    console.info(
      `[Webhook] app/uninstalled authenticated shop=${shop} topic=${topic} sessionId=${session?.id ?? "(none)"}`,
    );
  } catch (error) {
    console.error("[Webhook] app/uninstalled authenticate.webhook failed:", error);
    throw error;
  }

  try {
    console.info(`[Webhook] before-uninstall-handlers shop=${shop}`);
    const webhookId = request.headers.get("X-Shopify-Webhook-Id") ?? undefined;

    await onAppUninstalled({
      shop,
      topic,
      payload,
      sessionId: session?.id,
      webhookId,
      uninstalledAt: new Date(),
    });
    console.info(`[Webhook] after-uninstall-handlers shop=${shop}`);
  } catch (error) {
    console.error(`[Webhook] uninstall handlers failed shop=${shop}:`, error);
    throw error;
  }

  console.info(`[Webhook] app/uninstalled completed shop=${shop} status=200`);
  return returnWebhookOk({ shop, topic });
};
