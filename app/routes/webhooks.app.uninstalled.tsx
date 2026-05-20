import type { ActionFunctionArgs } from "react-router";
import { getAppEntry } from "../config/appEntry.server";
import { authenticate } from "../shopify.server";
import {
  AppUninstalledEvent,
  ensureAppEventHandlersRegistered,
  eventBus,
} from "../server/events/index.server";

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
    ensureAppEventHandlersRegistered();
    console.info(
      `[Webhook] before-publish AppUninstalled shop=${shop} appName=${appName}`,
    );
    await eventBus.publish(
      new AppUninstalledEvent({
        shop,
        topic,
        payload,
        sessionId: session?.id,
        appName,
        uninstalledAt: new Date(),
      }),
    );
    console.info(
      `[Webhook] after-publish AppUninstalled shop=${shop} (persistence + uninstall email handlers should have run)`,
    );
  } catch (error) {
    console.error(
      `[Webhook] publish AppUninstalled failed shop=${shop} appName=${appName}:`,
      error,
    );
    throw error;
  }

  console.info(`[Webhook] app/uninstalled completed shop=${shop} status=200`);
  return new Response();
};
