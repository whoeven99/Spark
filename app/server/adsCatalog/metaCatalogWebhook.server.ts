const LOG_PREFIX = "[Webhook][MetaCatalog]";

/** Meta Developer Console 未配置环境变量时的默认 Verify Token（与审核配置一致）。 */
export const META_CATALOG_WEBHOOK_VERIFY_TOKEN_DEFAULT = "123456";

export function getMetaCatalogWebhookVerifyToken(): string {
  return (
    process.env.META_WEBHOOK_VERIFY_TOKEN ?? META_CATALOG_WEBHOOK_VERIFY_TOKEN_DEFAULT
  ).trim();
}

/**
 * Meta Catalog Webhook Callback URL。
 * 依赖 SHOPIFY_APP_URL，例如 https://assistant-w7b.onrender.com/webhooks/meta/catalog
 */
export function getMetaCatalogWebhookCallbackUrl(): string | null {
  const appUrl = (process.env.SHOPIFY_APP_URL ?? "").replace(/\/$/, "");
  if (!appUrl) return null;
  return `${appUrl}/webhooks/meta/catalog`;
}

/**
 * Meta Webhooks 订阅校验（GET hub.mode=subscribe）。
 * @see https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */
export function verifyMetaCatalogWebhookSubscription(request: Request): Response {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  const expected = getMetaCatalogWebhookVerifyToken();

  if (!expected) {
    console.warn(`${LOG_PREFIX} META_WEBHOOK_VERIFY_TOKEN not configured, rejecting`);
    return new Response(null, { status: 403 });
  }

  if (mode === "subscribe" && token === expected && challenge) {
    console.info(`${LOG_PREFIX} subscription verified`);
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  console.warn(`${LOG_PREFIX} subscription verification failed mode=${mode ?? "(none)"}`);
  return new Response(null, { status: 403 });
}

/** Catalog 事件通知（POST）。当前仅记录日志并快速 200，避免 Meta 重试风暴。 */
export async function handleMetaCatalogWebhookEvent(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.warn(`${LOG_PREFIX} failed to parse JSON body`);
    return new Response(null, { status: 200 });
  }

  console.info(`${LOG_PREFIX} event received ${JSON.stringify(body).slice(0, 500)}`);
  return new Response(null, { status: 200 });
}
