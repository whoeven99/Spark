import { describe, expect, it } from "vitest";
import { buildInstallOpsTemplateData } from "../../../../../app/server/email/templates/installOpsTemplateData.server";

describe("buildInstallOpsTemplateData", () => {
  it("uses shop name for user when shopInfo present", () => {
    const installedAt = new Date("2026-05-20T10:00:00.000Z");
    const data = buildInstallOpsTemplateData({
      shop: "demo.myshopify.com",
      appName: "product-improve",
      source: "auth_callback",
      installedAt,
      shopInfo: {
        name: "Demo Store",
        myshopifyDomain: "demo.myshopify.com",
        email: "owner@example.com",
        planName: "Basic",
      },
    });

    expect(data.user).toBe("Demo Store");
    expect(data.shop_domain).toBe("demo.myshopify.com");
    expect(data.owner_email).toBe("owner@example.com");
    expect(data.plan).toContain("Basic");
    expect(data.app_name).toBe("product-improve");
    expect(data.installed_at).toBe(installedAt.toISOString());
  });

  it("prefers sessionSnapshot first_name, second_name, and email", () => {
    const data = buildInstallOpsTemplateData({
      shop: "demo.myshopify.com",
      appName: "product-improve",
      installedAt: new Date("2026-05-20T10:00:00.000Z"),
      shopInfo: { name: "Demo Store", email: "shop@example.com" },
      sessionSnapshot: {
        shop: "demo.myshopify.com",
        firstName: "Wei",
        lastName: "Zhang",
        email: "wei@example.com",
      },
    });

    expect(data.user).toBe("Wei Zhang");
    expect(data.first_name).toBe("Wei");
    expect(data.second_name).toBe("Zhang");
    expect(data.owner_email).toBe("wei@example.com");
  });

  it("falls back to shop domain when shopInfo missing", () => {
    const data = buildInstallOpsTemplateData({
      shop: "fallback.myshopify.com",
      appName: "chat",
      installedAt: new Date("2026-05-20T10:00:00.000Z"),
    });

    expect(data.user).toBe("fallback");
    expect(data.shop_domain).toBe("fallback.myshopify.com");
  });
});
