import { describe, expect, it } from "vitest";
import { buildNotificationTemplateData } from "../../../../app/server/notifications/buildNotificationTemplateData.server";
import type { NotificationAppConfig } from "../../../../app/server/notifications/types";

const appConfig: NotificationAppConfig = {
  appKey: "chat",
  appName: "Spark",
  supportEmail: "support@example.com",
  brandName: "Spark",
  dashboardUrl: "https://app.example.com/app",
};

describe("buildNotificationTemplateData", () => {
  it("maps install variables to tencent-cloud-html keys", () => {
    const data = buildNotificationTemplateData(appConfig, {
      shopName: "Demo Shop",
      shopDomain: "demo.myshopify.com",
      occurredAtUtc: "2026-05-28 02:00 UTC",
      recipientName: "Alice",
      installedAtUtc: "2026-05-28 01:00 UTC",
    });

    expect(data.appName).toBe("Spark");
    expect(data.shopName).toBe("Demo Shop");
    expect(data.recipientName).toBe("Alice");
    expect(data.installedAtUtc).toBe("2026-05-28 01:00 UTC");
    expect(data.supportEmail).toBe("support@example.com");
    expect(data.dashboardUrl).toBe("https://app.example.com/app");
    expect(data).toHaveProperty("creditsChanged");
    expect(data.creditUnit).toBe("");
  });

  it("maps credit account change fields", () => {
    const data = buildNotificationTemplateData(appConfig, {
      shopName: "Demo",
      shopDomain: "demo.myshopify.com",
      occurredAtUtc: "2026-05-28 02:00 UTC",
      purchaseType: "creditPack",
      creditAccountChange: {
        creditsChanged: 1000,
        creditsBefore: 500,
        creditsAfter: 1500,
        creditUnit: "credits",
        reason: "积分包购买",
      },
    });

    expect(data.purchaseType).toBe("积分购买");
    expect(data.creditsChanged).toBe("1000");
    expect(data.creditReason).toBe("积分包购买");
  });
});
