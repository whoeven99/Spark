/** Webhook 入口统一日志，便于排查「请求是否到达应用」。 */
export function logWebhookReceived(
  route: string,
  request: Request,
  extra?: Record<string, string>,
): void {
  const topicHeader = request.headers.get("x-shopify-topic") ?? "(missing)";
  const shopHeader = request.headers.get("x-shopify-shop-domain") ?? "(missing)";
  const webhookId = request.headers.get("x-shopify-webhook-id") ?? "(missing)";

  const extraPart = extra
    ? ` ${Object.entries(extra)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")}`
    : "";

  console.info(
    `[Webhook] ${route} received method=${request.method} url=${request.url} topicHeader=${topicHeader} shopHeader=${shopHeader} webhookId=${webhookId}${extraPart}`,
  );
}
