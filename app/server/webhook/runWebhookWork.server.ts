/**
 * Shopify webhook 须在数秒内返回 200；耗时逻辑放到后台执行，避免投递超时。
 */
export function runWebhookWorkInBackground(
  work: Promise<void>,
  context: { shop: string; topic: string; label: string },
): void {
  void work.catch((error) => {
    console.error(
      `[Webhook] background failed shop=${context.shop} topic=${context.topic} label=${context.label}:`,
      error,
    );
  });
}
