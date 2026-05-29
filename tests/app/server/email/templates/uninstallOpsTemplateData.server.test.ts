import { describe, expect, it } from "vitest";
import { buildUninstallOpsTemplateData } from "../../../../../app/server/email/templates/uninstallOpsTemplateData.server";

describe("buildUninstallOpsTemplateData", () => {
  it("uses firstName and email from sessionSnapshot", () => {
    const uninstalledAt = new Date("2026-05-20T10:00:00.000Z");
    const data = buildUninstallOpsTemplateData({
      shop: "demo.myshopify.com",
      appName: "chat",
      uninstalledAt,
      installDurationMs: 3_600_000,
      sessionSnapshot: {
        shop: "demo.myshopify.com",
        firstName: "Alice",
        email: "alice@example.com",
      },
    });

    expect(data.user).toBe("Alice");
    expect(data.first_name).toBe("Alice");
    expect(data.second_name).toBe("");
    expect(data.shop_name).toBe("Alice");
    expect(data.shop_domain).toBe("demo.myshopify.com");
    expect(data.owner_email).toBe("alice@example.com");
    expect(data.plan).toBe("");
    expect(data.app_name).toBe("chat");
    expect(data.uninstalled_at).toBe(uninstalledAt.toISOString());
    expect(data.install_duration).toBe("1h 0m");
  });

  it("combines first and last name for display", () => {
    const data = buildUninstallOpsTemplateData({
      shop: "demo.myshopify.com",
      appName: "chat",
      uninstalledAt: new Date("2026-05-20T10:00:00.000Z"),
      sessionSnapshot: {
        shop: "demo.myshopify.com",
        firstName: "Alice",
        lastName: "Smith",
        email: "alice@example.com",
      },
    });

    expect(data.user).toBe("Alice Smith");
    expect(data.first_name).toBe("Alice");
    expect(data.second_name).toBe("Smith");
  });

  it("falls back to shop domain when sessionSnapshot missing", () => {
    const data = buildUninstallOpsTemplateData({
      shop: "fallback.myshopify.com",
      appName: "chat",
      uninstalledAt: new Date("2026-05-20T10:00:00.000Z"),
    });

    expect(data.user).toBe("fallback");
    expect(data.shop_name).toBe("fallback");
    expect(data.shop_domain).toBe("fallback.myshopify.com");
    expect(data.owner_email).toBe("");
    expect(data.plan).toBe("");
  });
});
