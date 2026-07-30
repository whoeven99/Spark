import type { ActionFunctionArgs } from "react-router";
import { onAppUninstalled } from "../server/appLifecycle/onAppUninstalled.server";
import { runWebhookWorkInBackground } from "../server/webhook/runWebhookWork.server";
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

  return returnWebhookOk({ shop, topic });
};
