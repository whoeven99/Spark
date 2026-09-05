import { describe, expect, it, vi } from "vitest";
import type { ActionFunctionArgs } from "react-router";

const claimAppUninstalled = vi.fn();
const completeAppUninstalled = vi.fn();

vi.mock("../../../app/shopify.server", () => ({
  authenticate: {
    webhook: vi.fn().mockResolvedValue({
      shop: "demo.myshopify.com",
      topic: "app/uninstalled",
      payload: {},
      session: { id: "offline_demo" },
    }),
  },
}));

vi.mock("../../../app/server/appLifecycle/onAppUninstalled.server", () => ({
  claimAppUninstalled,
  completeAppUninstalled,
}));

const { action } = await import("../../../app/routes/webhooks.app.uninstalled");

describe("webhooks.app.uninstalled", () => {
  it("returns 200 after claim without waiting for purge/notify", async () => {
    claimAppUninstalled.mockResolvedValue({
      shouldNotify: true,
      recipient: null,
    });
    completeAppUninstalled.mockReturnValue(new Promise(() => undefined));

    const startedAt = Date.now();
    const response = await action({
      request: new Request("https://example.com/webhooks/app/uninstalled", {
        method: "POST",
        headers: { "X-Shopify-Webhook-Id": "wh-1" },
      }),
      params: {},
      context: {},
    } as ActionFunctionArgs);
    const elapsedMs = Date.now() - startedAt;

    expect(response.status).toBe(200);
    expect(elapsedMs).toBeLessThan(500);
    expect(claimAppUninstalled).toHaveBeenCalledOnce();
    expect(completeAppUninstalled).toHaveBeenCalledOnce();
  });
});
