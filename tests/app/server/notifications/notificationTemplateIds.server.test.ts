import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NOTIFICATION_TEMPLATE_IDS,
  NOTIFICATION_TEMPLATE_IDS_EN,
  resolveNotificationTemplateId,
} from "../../../../app/server/notifications/notificationTemplateIds.server";

describe("resolveNotificationTemplateId", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  it("returns default template ids for zh-CN", () => {
    delete process.env.NOTIFICATION_TEMPLATE_ID_APP_INSTALLED;
    expect(resolveNotificationTemplateId("appInstalled", "zh-CN")).toBe(
      NOTIFICATION_TEMPLATE_IDS.appInstalled,
    );
    expect(NOTIFICATION_TEMPLATE_IDS.appInstalled).toBe(180498);
    expect(NOTIFICATION_TEMPLATE_IDS.purchaseCreated).toBe(180500);
    expect(NOTIFICATION_TEMPLATE_IDS.subscriptionStarted).toBe(180503);
  });

  it("uses env override when valid", () => {
    process.env.NOTIFICATION_TEMPLATE_ID_APP_INSTALLED = "999001";
    expect(resolveNotificationTemplateId("appInstalled", "zh-CN")).toBe(999001);
  });

  it("falls back when env override is invalid", () => {
    process.env.NOTIFICATION_TEMPLATE_ID_APP_UNINSTALLED = "not-a-number";
    expect(resolveNotificationTemplateId("appUninstalled", "zh-CN")).toBe(180499);
  });

  it("returns en default template ids when en id is not configured", () => {
    delete process.env.NOTIFICATION_TEMPLATE_ID_PURCHASE_EN;
    expect(resolveNotificationTemplateId("purchaseCreated", "en")).toBe(
      NOTIFICATION_TEMPLATE_IDS_EN.purchaseCreated,
    );
    expect(NOTIFICATION_TEMPLATE_IDS_EN.purchaseCreated).toBe(184220);
  });

  it("returns default en template ids for all events", () => {
    expect(resolveNotificationTemplateId("appInstalled", "en")).toBe(184217);
    expect(resolveNotificationTemplateId("appUninstalled", "en")).toBe(184219);
    expect(resolveNotificationTemplateId("purchaseCreated", "en")).toBe(184220);
    expect(resolveNotificationTemplateId("subscriptionCanceled", "en")).toBe(184221);
    expect(resolveNotificationTemplateId("subscriptionChanged", "en")).toBe(184222);
    expect(resolveNotificationTemplateId("subscriptionStarted", "en")).toBe(184223);
  });

  it("uses en env override when configured", () => {
    process.env.NOTIFICATION_TEMPLATE_ID_PURCHASE_EN = "990500";
    expect(resolveNotificationTemplateId("purchaseCreated", "en")).toBe(990500);
  });
});
