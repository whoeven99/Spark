import { describe, expect, it } from "vitest";
import {
  buildUninstallEventReferenceId,
  buildUninstallNotifyReferenceId,
} from "../../../../app/server/commonEventLog/handleAppUninstalled.server";

describe("buildUninstallNotifyReferenceId", () => {
  it("uses shop-level key for ops notify dedup", () => {
    expect(buildUninstallNotifyReferenceId("demo.myshopify.com")).toBe(
      "uninstall:notify:demo.myshopify.com",
    );
  });
});

describe("buildUninstallEventReferenceId", () => {
  it("prefers webhook id for dedup", () => {
    expect(
      buildUninstallEventReferenceId({
        shop: "demo.myshopify.com",
        webhookId: "wh-1",
        sessionId: "offline_demo",
      }),
    ).toBe("uninstall:webhook:wh-1");
  });

  it("uses session id when webhook id is absent", () => {
    expect(
      buildUninstallEventReferenceId({
        shop: "demo.myshopify.com",
        sessionId: "offline_demo",
      }),
    ).toBe("uninstall:offline_demo");
  });
});
