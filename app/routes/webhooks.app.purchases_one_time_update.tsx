import type { ActionFunctionArgs } from "react-router";
import { handleAppPurchaseOneTimeWebhook } from "../server/billing/index.server";
import { runWebhookWorkInBackground } from "../server/webhook/runWebhookWork.server";
import {
  authenticateWebhookLogged,
  returnWebhookOk,
} from "../server/webhook/webhookDebugLog.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticateWebhookLogged(request);

  runWebhookWorkInBackground(
    handleAppPurchaseOneTimeWebhook({
      shop,
      payload,
    }),
    { shop, topic, label: "app_purchases_one_time/update" },
  );

  return returnWebhookOk({ shop, topic });
};
