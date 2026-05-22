import { describe, expect, it } from "vitest";
import {
  buildUninstallMessage,
  formatUninstallNotifyField,
} from "../../../../app/server/feishu/scenarios/sendUninstallFeishuNotify.server";

describe("formatUninstallNotifyField", () => {
  it("returns fallback for empty values", () => {
    expect(formatUninstallNotifyField(null)).toBe("（未提供）");
    expect(formatUninstallNotifyField("   ")).toBe("（未提供）");
  });

  it("truncates long feedback", () => {
    const long = "a".repeat(600);
    const formatted = formatUninstallNotifyField(long, 500);
    expect(formatted.endsWith("…")).toBe(true);
    expect(formatted.length).toBe(501);
  });
});

describe("buildUninstallMessage", () => {
  it("includes reason and feedback lines", () => {
    const message = buildUninstallMessage({
      shop: "demo.myshopify.com",
      appName: "spark-zz",
      uninstalledAt: new Date("2026-05-20T10:00:00.000Z"),
      uninstallReason: "Too expensive",
      uninstallFeedback: "Need cheaper plan",
    });

    expect(message).toContain("卸载原因: Too expensive");
    expect(message).toContain("用户反馈: Need cheaper plan");
  });

  it("shows fallback when reason and feedback are missing", () => {
    const message = buildUninstallMessage({
      shop: "demo.myshopify.com",
      appName: "spark-zz",
      uninstalledAt: new Date("2026-05-20T10:00:00.000Z"),
    });

    expect(message).toContain("卸载原因: （未提供）");
    expect(message).toContain("用户反馈: （未提供）");
  });
});
