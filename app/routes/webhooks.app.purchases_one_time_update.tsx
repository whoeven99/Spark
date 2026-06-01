import type { ActionFunctionArgs } from "react-router";
import { getAppEntry } from "../config/appEntry.server";
import { handleAppPurchaseOneTimeWebhook } from "../server/billing/index.server";
import {
  authenticateWebhookLogged,
  returnWebhookOk,
} from "../server/webhook/webhookDebugLog.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticateWebhookLogged(request);

  try {
    await handleAppPurchaseOneTimeWebhook({
      shop,
      payload,
      appName: getAppEntry(),
    });
  } catch (error) {
    console.error("[Billing] app_purchases_one_time/update handler failed:", error);
  }

  return returnWebhookOk({ shop, topic });
};
