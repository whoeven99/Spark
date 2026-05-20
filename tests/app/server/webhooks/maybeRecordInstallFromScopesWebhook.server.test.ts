import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../app/server/commonEventLog/recordAppInstalled.server", () => ({
  recordAppInstalled: vi.fn().mockResolvedValue(undefined),
}));

describe("maybeRecordInstallFromScopesWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records install on first scope grant", async () => {
    const { recordAppInstalled } = await import(
      "../../../../app/server/commonEventLog/recordAppInstalled.server"
    );
    const { maybeRecordInstallFromScopesWebhook } = await import(
      "../../../../app/server/webhooks/maybeRecordInstallFromScopesWebhook.server"
    );

    await maybeRecordInstallFromScopesWebhook({
      shop: "test.myshopify.com",
      sessionId: "offline_test.myshopify.com",
      payload: { current: ["read_products"], previous: [] },
    });

    expect(recordAppInstalled).toHaveBeenCalledWith(
      expect.objectContaining({
        shop: "test.myshopify.com",
        source: "scopes_update_webhook",
        scope: "read_products",
      }),
    );
  });

  it("skips when previous scopes exist", async () => {
    const { recordAppInstalled } = await import(
      "../../../../app/server/commonEventLog/recordAppInstalled.server"
    );
    const { maybeRecordInstallFromScopesWebhook } = await import(
      "../../../../app/server/webhooks/maybeRecordInstallFromScopesWebhook.server"
    );

    await maybeRecordInstallFromScopesWebhook({
      shop: "test.myshopify.com",
      sessionId: "offline_test.myshopify.com",
      payload: {
        current: ["read_products", "write_products"],
        previous: ["read_products"],
      },
    });

    expect(recordAppInstalled).not.toHaveBeenCalled();
  });
});
