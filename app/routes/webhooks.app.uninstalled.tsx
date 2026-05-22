import type { ActionFunctionArgs } from "react-router";
import { getAppEntry } from "../config/appEntry.server";
import { onAppUninstalled } from "../server/appLifecycle/onAppUninstalled.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const appName = getAppEntry();

  let shop: string;
  let session: Awaited<ReturnType<typeof authenticate.webhook>>["session"];
  let topic: string;
  let payload: unknown;

  try {
    ({ shop, session, topic, payload } = await authenticate.webhook(request));
    console.info(
      `[Webhook] app/uninstalled authenticated shop=${shop} topic=${topic} sessionId=${session?.id ?? "(none)"} appName=${appName}`,
    );
  } catch (error) {
    console.error("[Webhook] app/uninstalled authenticate.webhook failed:", error);
    throw error;
  }

  try {
    console.info(
      `[Webhook] before-uninstall-handlers shop=${shop} appName=${appName}`,
    );
    const webhookId = request.headers.get("X-Shopify-Webhook-Id") ?? undefined;

    await onAppUninstalled({
      shop,
      topic,
      payload,
      sessionId: session?.id,
      webhookId,
      appName,
      uninstalledAt: new Date(),
    });
    console.info(
      `[Webhook] after-uninstall-handlers shop=${shop}`,
    );
  } catch (error) {
    console.error(
      `[Webhook] uninstall handlers failed shop=${shop} appName=${appName}:`,
      error,
    );
    throw error;
  }

  console.info(`[Webhook] app/uninstalled completed shop=${shop} status=200`);
  return new Response();
};
