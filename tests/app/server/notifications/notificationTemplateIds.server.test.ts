import { afterEach, describe, expect, it } from "vitest";
import {
  NOTIFICATION_TEMPLATE_IDS,
  resolveNotificationTemplateId,
} from "../../../../app/server/notifications/notificationTemplateIds.server";

describe("resolveNotificationTemplateId", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("returns default template ids", () => {
    delete process.env.NOTIFICATION_TEMPLATE_ID_APP_INSTALLED;
    expect(resolveNotificationTemplateId("appInstalled")).toBe(
      NOTIFICATION_TEMPLATE_IDS.appInstalled,
    );
    expect(NOTIFICATION_TEMPLATE_IDS.appInstalled).toBe(180498);
    expect(NOTIFICATION_TEMPLATE_IDS.purchaseCreated).toBe(180500);
    expect(NOTIFICATION_TEMPLATE_IDS.subscriptionStarted).toBe(180503);
  });

  it("uses env override when valid", () => {
    process.env.NOTIFICATION_TEMPLATE_ID_APP_INSTALLED = "999001";
    expect(resolveNotificationTemplateId("appInstalled")).toBe(999001);
  });

  it("falls back when env override is invalid", () => {
    process.env.NOTIFICATION_TEMPLATE_ID_APP_UNINSTALLED = "not-a-number";
    expect(resolveNotificationTemplateId("appUninstalled")).toBe(180499);
  });
});
