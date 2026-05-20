import type { ActionFunctionArgs } from "react-router";
import { getAppEntry } from "../config/appEntry.server";
import { authenticate } from "../shopify.server";
import { handleScopesUpdate } from "../server/commonEventLog/index.server";
import { logWebhookReceived } from "../server/webhooks/logWebhookReceived.server";
import { maybeRecordInstallFromScopesWebhook } from "../server/webhooks/maybeRecordInstallFromScopesWebhook.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const appName = getAppEntry();
  logWebhookReceived("app/scopes_update", request, { appName });

  let shop: string;
  let session: Awaited<ReturnType<typeof authenticate.webhook>>["session"];
  let topic: string;
  let payload: unknown;

  try {
    ({ shop, session, topic, payload } = await authenticate.webhook(request));
    console.info(
      `[Webhook] app/scopes_update authenticated shop=${shop} topic=${topic} sessionId=${session?.id ?? "(none)"} appName=${appName}`,
    );
  } catch (error) {
    console.error("[Webhook] app/scopes_update authenticate.webhook failed:", error);
    throw error;
  }

  try {
    await handleScopesUpdate({
      shop,
      topic,
      payload,
      sessionId: session?.id,
    });
    console.info(`[Webhook] app/scopes_update persistence done shop=${shop}`);
  } catch (error) {
    console.error(
      `[Webhook] app/scopes_update handleScopesUpdate failed shop=${shop}:`,
      error,
    );
    throw error;
  }

  try {
    await maybeRecordInstallFromScopesWebhook({
      shop,
      payload,
      sessionId: session?.id,
    });
  } catch (error) {
    console.error(
      `[Webhook] app/scopes_update install-record failed shop=${shop}:`,
      error,
    );
  }

  console.info(`[Webhook] app/scopes_update completed shop=${shop} status=200`);
  return new Response();
};
