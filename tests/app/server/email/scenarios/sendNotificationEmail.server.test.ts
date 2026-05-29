import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../app/server/email/services/emailService.server", () => ({
  sendTemplateEmail: vi.fn().mockResolvedValue({ ok: true, requestId: "req-1" }),
}));

vi.mock("../../../../../app/server/notifications/renderNotification", () => ({
  renderNotificationEmail: vi.fn().mockReturnValue({
    subject: "Spark 已成功安装",
    html: "<p>html</p>",
    text: "text",
  }),
}));

describe("sendNotificationEmail", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("skips when no recipient", async () => {
    const opsNotify = await import(
      "../../../../../app/server/email/opsNotifyEmail.server",
    );
    vi.spyOn(opsNotify, "resolveOpsEmailDestination").mockReturnValue(null);

    const { sendNotificationEmail } = await import(
      "../../../../../app/server/email/scenarios/sendNotificationEmail.server",
    );

    const result = await sendNotificationEmail({
      event: "appInstalled",
      shop: "demo.myshopify.com",
      appKey: "chat",
      variables: {
        shopName: "Demo",
        shopDomain: "demo.myshopify.com",
        occurredAtUtc: "2026-05-28 02:00 UTC",
        installedAtUtc: "2026-05-28 01:00 UTC",
      },
    });

    expect(result).toEqual({
      ok: false,
      skipped: true,
      reason: "no_recipient",
    });
  });

  it("sends template email with resolved template id and data", async () => {
    process.env.OPS_NOTIFY_EMAIL = "merchant@example.com";

    const { sendTemplateEmail } = await import(
      "../../../../../app/server/email/services/emailService.server"
    );
    const { sendNotificationEmail } = await import(
      "../../../../../app/server/email/scenarios/sendNotificationEmail.server"
    );

    await sendNotificationEmail({
      event: "appInstalled",
      shop: "demo.myshopify.com",
      appKey: "chat",
      variables: {
        shopName: "Demo",
        shopDomain: "demo.myshopify.com",
        occurredAtUtc: "2026-05-28 02:00 UTC",
        installedAtUtc: "2026-05-28 01:00 UTC",
        recipientName: "Alice",
      },
    });

    expect(sendTemplateEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 180498,
        subject: "Spark 已成功安装",
        to: "merchant@example.com",
        templateData: expect.objectContaining({
          shopName: "Demo",
          recipientName: "Alice",
        }),
      }),
      {},
    );
  });
});
