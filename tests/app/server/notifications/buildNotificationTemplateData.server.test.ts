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

  it("maps credit account change fields with locale zh-CN", () => {
    const data = buildNotificationTemplateData(
      appConfig,
      {
        shopName: "Demo",
        shopDomain: "demo.myshopify.com",
        occurredAtUtc: "2026-05-28 02:00 UTC",
        purchaseType: "creditPack",
        billingPeriodKind: "oneTime",
        orderId: "gid://shopify/AppPurchaseOneTime/2578481175",
        amountUsd: "9.99",
        creditAccountChange: {
          creditsChanged: 1000,
          creditsBefore: 500,
          creditsAfter: 1500,
          creditReasonKey: "credit_pack_purchased",
        },
      },
      "zh-CN",
    );

    expect(data.purchaseType).toBe("积分购买");
    expect(data.orderId).toBe("# 2578481175");
    expect(data.amountUsd).toBe("$9.99");
    expect(data.billingPeriod).toBe("一次性购买");
    expect(data.creditsChanged).toBe("1,000");
    expect(data.creditUnit).toBe("");
    expect(data.creditReason).toBe("积分包购买");
  });

  it("maps billing fields for en locale subscription", () => {
    const data = buildNotificationTemplateData(
      appConfig,
      {
        shopName: "rinleaf",
        shopDomain: "x0hgaj-gp.myshopify.com",
        occurredAtUtc: "2026-05-28 02:00 UTC",
        billingInterval: "EVERY_30_DAYS",
        currentPlanName: "Pro",
        creditAccountChange: {
          creditsChanged: 5000,
          creditsBefore: 0,
          creditsAfter: 5000,
          creditReasonKey: "subscription_started",
        },
      },
      "en",
    );

    expect(data.billingPeriod).toBe("EVERY_30_DAYS");
    expect(data.creditReason).toBe("Subscription activated");
    expect(data.recipientName).toBe("merchant");
  });

  it("maps credit pack purchase fields with locale en", () => {
    const data = buildNotificationTemplateData(
      appConfig,
      {
        shopName: "rinleaf",
        shopDomain: "ciwishop.myshopify.com",
        occurredAtUtc: "2026-06-01 06:23 UTC",
        purchaseType: "creditPack",
        billingPeriodKind: "oneTime",
        orderId: "gid://shopify/AppPurchaseOneTime/2578513943",
        planName: "Token pack 100K",
        amountUsd: "USD 9.99",
        creditAccountChange: {
          creditsChanged: 100000,
          creditsBefore: 2000000,
          creditsAfter: 2100000,
          creditReasonKey: "credit_pack_purchased",
        },
      },
      "en",
    );

    expect(data.purchaseType).toBe("Credit pack");
    expect(data.amountUsd).toBe("$9.99");
    expect(data.amountUsd).not.toMatch(/USD/i);
    expect(data.billingPeriod).toBe("AppPurchaseOneTime");
    expect(data.creditReason).toBe("Credit pack purchased");
  });
});
