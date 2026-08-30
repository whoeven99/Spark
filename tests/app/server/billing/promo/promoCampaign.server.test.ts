import { describe, expect, it } from "vitest";
import {
  isPromoCampaignActive,
  resolvePromoCampaignConfig,
  getVisiblePromoCampaign,
} from "../../../../../app/server/billing/promo/promoCampaign.server";

describe("resolvePromoCampaignConfig", () => {
  it("默认开启安装福利 1000000 Token", () => {
    const campaign = resolvePromoCampaignConfig({});
    expect(campaign).toEqual({
      id: "install-welcome-1m",
      enabled: true,
      tokenAmount: 1_000_000,
      startsAt: null,
      endsAt: null,
    });
  });

  it("支持环境变量覆盖", () => {
    const campaign = resolvePromoCampaignConfig({
      SPARK_PROMO_ENABLED: "true",
      SPARK_PROMO_CAMPAIGN_ID: "spring-2026",
      SPARK_PROMO_TOKEN_AMOUNT: "50000",
      SPARK_PROMO_STARTS_AT: "2026-03-01T00:00:00.000Z",
      SPARK_PROMO_ENDS_AT: "2026-03-31T23:59:59.000Z",
    });
    expect(campaign.id).toBe("spring-2026");
    expect(campaign.tokenAmount).toBe(50_000);
    expect(campaign.startsAt?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(campaign.endsAt?.toISOString()).toBe("2026-03-31T23:59:59.000Z");
  });

  it("SPARK_PROMO_ENABLED=false 时关闭", () => {
    const campaign = resolvePromoCampaignConfig({
      SPARK_PROMO_ENABLED: "false",
    });
    expect(campaign.enabled).toBe(false);
  });
});

describe("isPromoCampaignActive / getVisiblePromoCampaign", () => {
  it("未开始不展示", () => {
    const campaign = resolvePromoCampaignConfig({
      SPARK_PROMO_STARTS_AT: "2026-12-01T00:00:00.000Z",
    });
    expect(
      isPromoCampaignActive(campaign, new Date("2026-08-28T00:00:00.000Z")),
    ).toBe(false);
  });

  it("已结束不展示", () => {
    const campaign = resolvePromoCampaignConfig({
      SPARK_PROMO_ENDS_AT: "2026-01-01T00:00:00.000Z",
    });
    expect(
      isPromoCampaignActive(campaign, new Date("2026-08-28T00:00:00.000Z")),
    ).toBe(false);
  });

  it("窗口内展示", () => {
    const visible = getVisiblePromoCampaign(
      {
        SPARK_PROMO_STARTS_AT: "2026-08-01T00:00:00.000Z",
        SPARK_PROMO_ENDS_AT: "2026-09-01T00:00:00.000Z",
      },
      new Date("2026-08-28T00:00:00.000Z"),
    );
    expect(visible?.id).toBe("install-welcome-1m");
    expect(visible?.tokenAmount).toBe(1_000_000);
  });
});

describe("ensureInstallPromoTokens", () => {
  it("活动关闭时返回 null 且不抛错", async () => {
    const { ensureInstallPromoTokens } = await import(
      "../../../../../app/server/billing/promo/promoCampaign.server"
    );
    const prev = process.env.SPARK_PROMO_ENABLED;
    process.env.SPARK_PROMO_ENABLED = "false";
    try {
      await expect(ensureInstallPromoTokens("demo.myshopify.com")).resolves.toBeNull();
    } finally {
      if (prev === undefined) delete process.env.SPARK_PROMO_ENABLED;
      else process.env.SPARK_PROMO_ENABLED = prev;
    }
  });
});
