import type { ActionFunctionArgs } from "react-router";
import { getAppEntry } from "../config/appEntry.server";
import { onAppUninstalled } from "../server/appLifecycle/onAppUninstalled.server";
import { runWebhookWorkInBackground } from "../server/webhook/runWebhookWork.server";
import {
  authenticateWebhookLogged,
  returnWebhookOk,
} from "../server/webhook/webhookDebugLog.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const appName = getAppEntry();
  const { shop, session, topic, payload } =
    await authenticateWebhookLogged(request);
  const webhookId = request.headers.get("X-Shopify-Webhook-Id") ?? undefined;

  runWebhookWorkInBackground(
    onAppUninstalled({
      shop,
      topic,
      payload,
      sessionId: session?.id,
      webhookId,
      appName,
      uninstalledAt: new Date(),
    }),
    { shop, topic, label: "app/uninstalled" },
  );

  return returnWebhookOk({ shop, topic });
};
