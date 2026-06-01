import { describe, expect, it } from "vitest";

describe("onAppInstalled", () => {
  it("logs install event without throwing", async () => {
    const { onAppInstalled } = await import(
      "../../../../app/server/appLifecycle/onAppInstalled.server"
    );

    await expect(
      onAppInstalled({
        shop: "demo.myshopify.com",
        sessionId: "offline_demo",
        appName: "chat",
        source: "test",
        installedAt: new Date("2026-05-20T10:00:00.000Z"),
      }),
    ).resolves.toBeUndefined();
  });
});
