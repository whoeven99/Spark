import { afterEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../../../app/server/events/eventBus.server";
import {
  AppInstalledEvent,
  APP_INSTALLED_EVENT,
} from "../../../../app/server/events/install/appInstalledEvent.server";

vi.mock("../../../../app/server/email/scenarios/sendInstallOpsEmail.server", () => ({
  sendInstallOpsEmail: vi.fn().mockResolvedValue({ ok: true, requestId: "req-1" }),
}));

vi.mock("../../../../app/shopify.server", () => ({
  unauthenticated: {
    admin: vi.fn().mockRejectedValue(new Error("no session in test")),
  },
}));

describe("handleAppInstalledEmail via EventBus", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("invokes sendInstallOpsEmail when event is published", async () => {
    const { sendInstallOpsEmail } = await import(
      "../../../../app/server/email/scenarios/sendInstallOpsEmail.server"
    );
    const { handleAppInstalledEmail } = await import(
      "../../../../app/server/events/install/appInstalledHandlers.server"
    );

    const bus = new EventBus();
    bus.on(APP_INSTALLED_EVENT, (event) =>
      handleAppInstalledEmail(event as AppInstalledEvent),
    );

    await bus.publish(
      new AppInstalledEvent({
        shop: "demo.myshopify.com",
        sessionId: "offline_demo",
        appName: "chat",
        source: "test",
        installedAt: new Date("2026-05-20T10:00:00.000Z"),
      }),
    );

    expect(sendInstallOpsEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        shop: "demo.myshopify.com",
        appName: "chat",
        source: "test",
      }),
    );
  });
});
