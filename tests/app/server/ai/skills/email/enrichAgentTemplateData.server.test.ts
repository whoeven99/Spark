import { describe, expect, it, vi, beforeEach } from "vitest";
import { EMAIL_TEMPLATE_IDS } from "../../../../../../app/server/email/templates/emailTemplates.server";
import type { AgentContext } from "../../../../../../app/server/ai/core/toolRegistry.server";
import { fetchShopBasicInfo } from "../../../../../../app/server/shopify/fetchShopBasicInfo.server";
import {
  enrichAgentTemplateData,
  normalizeAgentTemplateDataKeys,
  resolveMerchantEmail,
} from "../../../../../../app/server/ai/skills/email/enrichAgentTemplateData.server";

vi.mock("../../../../../../app/server/shopify/fetchShopBasicInfo.server", () => ({
  fetchShopBasicInfo: vi.fn(),
}));

vi.mock("../../../../../../app/server/notifications/config", () => ({
  getNotificationAppConfig: vi.fn(() => ({
    appKey: "chat",
    appName: "Spark",
    brandName: "Spark Brand",
    supportEmail: "support@example.com",
  })),
}));

vi.mock("../../../../../../app/server/notifications/buildNotificationDashboardUrl.server", () => ({
  buildNotificationDashboardUrl: vi.fn(() => "https://app.example.com/app"),
}));

const mockAdmin = { graphql: vi.fn() };

const context: AgentContext = {
  admin: mockAdmin as AgentContext["admin"],
  shop: "demo.myshopify.com",
  appName: "chat",
};

describe("normalizeAgentTemplateDataKeys", () => {
  it("maps APP_Name to appName and removes legacy key", () => {
    expect(normalizeAgentTemplateDataKeys({ APP_Name: "spark_zz" })).toEqual({
      appName: "spark_zz",
    });
  });

  it("prefers explicit appName over APP_Name", () => {
    expect(
      normalizeAgentTemplateDataKeys({ APP_Name: "legacy", appName: "canonical" }),
    ).toEqual({ appName: "canonical" });
  });
});

describe("resolveMerchantEmail", () => {
  it("prefers store owner email", () => {
    expect(
      resolveMerchantEmail({ email: "owner@shop.com", contactEmail: "support@shop.com" }),
    ).toBe("owner@shop.com");
  });

  it("falls back to contactEmail when email missing", () => {
    expect(resolveMerchantEmail({ contactEmail: "support@shop.com" })).toBe(
      "support@shop.com",
    );
  });

  it("returns null when no email available", () => {
    expect(resolveMerchantEmail(null)).toBeNull();
    expect(resolveMerchantEmail({ name: "Shop" })).toBeNull();
  });
});

describe("enrichAgentTemplateData", () => {
  beforeEach(() => {
    vi.mocked(fetchShopBasicInfo).mockResolvedValue({
      name: "Demo Shop",
      myshopifyDomain: "demo.myshopify.com",
    });
  });

  it("fills install template fields for APP_INSTALL_SUCCESS", async () => {
    const data = await enrichAgentTemplateData(
      EMAIL_TEMPLATE_IDS.APP_INSTALL_SUCCESS,
      context,
    );

    expect(data.appName).toBe("Spark");
    expect(data.brandName).toBe("Spark Brand");
    expect(data.shopName).toBe("Demo Shop");
    expect(data.shopDomain).toBe("demo.myshopify.com");
    expect(data.installedAtUtc).toMatch(/ UTC$/);
    expect(data.occurredAtUtc).toMatch(/ UTC$/);
    expect(data.supportEmail).toBe("support@example.com");
    expect(data.dashboardUrl).toBe("https://app.example.com/app");
  });

  it("normalizes APP_Name and allows agent appName override", async () => {
    const data = await enrichAgentTemplateData(
      EMAIL_TEMPLATE_IDS.APP_INSTALL_SUCCESS,
      context,
      { APP_Name: "spark_zz" },
    );

    expect(data.appName).toBe("spark_zz");
    expect(data).not.toHaveProperty("APP_Name");
    expect(data.shopName).toBe("Demo Shop");
  });

  it("allows recipientName override from agent", async () => {
    const data = await enrichAgentTemplateData(
      EMAIL_TEMPLATE_IDS.APP_INSTALL_SUCCESS,
      context,
      { recipientName: "Alice" },
    );

    expect(data.recipientName).toBe("Alice");
  });

  it("fills uninstalledAtUtc for APP_UNINSTALL", async () => {
    const data = await enrichAgentTemplateData(
      EMAIL_TEMPLATE_IDS.APP_UNINSTALL,
      context,
    );

    expect(data.uninstalledAtUtc).toMatch(/ UTC$/);
    expect(data.installedAtUtc).toBe("");
  });
});
