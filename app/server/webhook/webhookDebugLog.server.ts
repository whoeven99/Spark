import { authenticate } from "../../shopify.server";

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function shopifyWebhookHeaders(request: Request): Record<string, string> {
  const keys = [
    "X-Shopify-Topic",
    "X-Shopify-Shop-Domain",
    "X-Shopify-Webhook-Id",
    "X-Shopify-Api-Version",
    "X-Shopify-Triggered-At",
    "X-Shopify-Event-Id",
    "X-Shopify-Hmac-Sha256",
  ];
  const headers: Record<string, string> = {};
  for (const key of keys) {
    const value = request.headers.get(key);
    if (value) headers[key] = value;
  }
  return headers;
}

export function logWebhookIncoming(
  request: Request,
  params: {
    shop: string;
    topic: string;
    payload: unknown;
    sessionId?: string;
  },
): void {
  console.info("[Webhook] incoming", {
    shop: params.shop,
    topic: params.topic,
    sessionId: params.sessionId ?? null,
    headers: shopifyWebhookHeaders(request),
  });
  console.info("[Webhook] payload:\n", safeJsonStringify(params.payload));
}

export async function logWebhookResponse(
  response: Response,
  params: { shop: string; topic: string },
): Promise<void> {
  const clone = response.clone();
  const bodyText = await clone.text();
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  console.info("[Webhook] response", {
    shop: params.shop,
    topic: params.topic,
    status: response.status,
    statusText: response.statusText,
    headers,
    bodyLength: bodyText.length,
  });
  console.info(
    "[Webhook] response body:\n",
    bodyText.length > 0 ? bodyText : "(empty)",
  );
}

export async function authenticateWebhookLogged(request: Request) {
  const result = await authenticate.webhook(request);
  logWebhookIncoming(request, {
    shop: result.shop,
    topic: result.topic,
    payload: result.payload,
    sessionId: result.session?.id,
  });
  return result;
}

export function returnWebhookOk(params: {
  shop: string;
  topic: string;
  init?: ResponseInit;
}): Response {
  const response = new Response(null, params.init);
  void logWebhookResponse(response, {
    shop: params.shop,
    topic: params.topic,
  });
  return response;
}
