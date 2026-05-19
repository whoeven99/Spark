import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { handleScopesUpdate } from "../server/commonEventLog/index.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic, payload } = await authenticate.webhook(request);

  console.info(`[CommonEvent] webhook ${topic} shop=${shop}`);

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

  return new Response();
};
