import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../app/server/email/scenarios/sendInstallOpsEmail.server", () => ({
  sendInstallOpsEmail: vi.fn().mockResolvedValue({ ok: true, requestId: "req-1" }),
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

  it("invokes sendInstallOpsEmail with install params", async () => {
    const { sendInstallOpsEmail } = await import(
      "../../../../app/server/email/scenarios/sendInstallOpsEmail.server"
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

    expect(sendInstallOpsEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        shop: "demo.myshopify.com",
        appName: "chat",
        source: "test",
      }),
    );
  });
});
