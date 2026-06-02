import { afterEach, describe, expect, it, vi } from "vitest";

describe("getNotificationAppConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("defaults supportEmail to support@ciwi.ai", async () => {
    vi.stubEnv("NOTIFICATION_SUPPORT_EMAIL", "");
    const { getNotificationAppConfig } = await import(
      "../../../../app/server/notifications/config"
    );
    expect(getNotificationAppConfig("chat").supportEmail).toBe("support@ciwi.ai");
  });

  it("respects NOTIFICATION_SUPPORT_EMAIL override", async () => {
    vi.stubEnv("NOTIFICATION_SUPPORT_EMAIL", "custom@example.com");
    const { getNotificationAppConfig } = await import(
      "../../../../app/server/notifications/config"
    );
    expect(getNotificationAppConfig("chat").supportEmail).toBe("custom@example.com");
  });
});
