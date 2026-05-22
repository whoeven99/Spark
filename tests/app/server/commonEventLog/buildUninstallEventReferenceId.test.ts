import { describe, expect, it } from "vitest";
import { buildUninstallEventReferenceId } from "../../../../app/server/commonEventLog/handleAppUninstalled.server";

describe("buildUninstallEventReferenceId", () => {
  it("prefers webhook id for dedup", () => {
    expect(
      buildUninstallEventReferenceId({
        shop: "demo.myshopify.com",
        appName: "chat",
        webhookId: "wh-1",
        sessionId: "offline_demo",
      }),
    ).toBe("uninstall:webhook:wh-1");
  });

  it("uses session id when webhook id is absent", () => {
    expect(
      buildUninstallEventReferenceId({
        shop: "demo.myshopify.com",
        appName: "chat",
        sessionId: "offline_demo",
      }),
    ).toBe("uninstall:offline_demo");
  });
});
