import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../app/server/email/scenarios/sendNotificationEmail.server", () => ({
  sendNotificationEmail: vi.fn().mockResolvedValue({ ok: true, requestId: "req-1" }),
}));

vi.mock("../../../../app/shopify.server", () => ({
  unauthenticated: {
    admin: vi.fn().mockRejectedValue(new Error("no session in test")),
  },
}));

describe("onAppInstalled", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("invokes sendNotificationEmail with install params", async () => {
    const { sendNotificationEmail } = await import(
      "../../../../app/server/email/scenarios/sendNotificationEmail.server"
    );
    const { onAppInstalled } = await import(
      "../../../../app/server/appLifecycle/onAppInstalled.server"
    );

    await onAppInstalled({
      shop: "demo.myshopify.com",
      sessionId: "offline_demo",
      appName: "chat",
      source: "test",
      installedAt: new Date("2026-05-20T10:00:00.000Z"),
    });

    expect(sendNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "appInstalled",
        shop: "demo.myshopify.com",
        appKey: "chat",
        variables: expect.objectContaining({
          shopDomain: "demo.myshopify.com",
        }),
      }),
    );
  });
});
