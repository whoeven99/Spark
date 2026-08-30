import {
  authenticateWebhookLogged,
  returnWebhookOk,
} from "./webhookDebugLog.server";

type WebhookAuth = Awaited<ReturnType<typeof authenticateWebhookLogged>>;

/**
 * Shopify webhook（W2）：
 * - HMAC/鉴权失败：原样抛出（通常 401），不 ack 伪造请求
 * - 鉴权通过后：业务异常只打日志，一律 200
 */
export async function runShopifyWebhookAction(
  request: Request,
  handler: (auth: WebhookAuth) => Promise<Response | void>,
): Promise<Response> {
  let auth: WebhookAuth;
  try {
    auth = await authenticateWebhookLogged(request);
  } catch (error) {
    console.error("[Webhook] authenticate.webhook failed:", error);
    throw error;
  }

  try {
    const result = await handler(auth);
    if (result instanceof Response) return result;
    return returnWebhookOk({ shop: auth.shop, topic: auth.topic });
  } catch (error) {
    console.error(
      `[Webhook] handler failed shop=${auth.shop} topic=${auth.topic}:`,
      error,
    );
    return returnWebhookOk({ shop: auth.shop, topic: auth.topic });
  }
}
