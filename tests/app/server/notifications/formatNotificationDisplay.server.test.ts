import { afterEach, describe, expect, it } from "vitest";
import {
  formatBillingPeriod,
  formatCreditAmount,
  formatCreditReason,
  formatPurchaseType,
  formatShopifyOrderDisplayId,
  formatUsdDisplay,
  mapSessionLocaleToNotificationLocale,
  resolveNotificationLocale,
} from "../../../../app/server/notifications/formatNotificationDisplay.server";

describe("formatShopifyOrderDisplayId", () => {
  it("extracts numeric id from GID", () => {
    expect(
      formatShopifyOrderDisplayId(
        "gid://shopify/AppPurchaseOneTime/2578481175",
      ),
    ).toBe("# 2578481175");
  });

  it("formats plain numeric id", () => {
    expect(formatShopifyOrderDisplayId("2578481175")).toBe("# 2578481175");
  });
});

describe("formatCreditAmount", () => {
  it("adds thousand separators", () => {
    expect(formatCreditAmount(1000)).toBe("1,000");
    expect(formatCreditAmount(1500000)).toBe("1,500,000");
  });
});

describe("formatUsdDisplay", () => {
  it("returns dollar sign and two decimals", () => {
    expect(formatUsdDisplay("9.99")).toBe("$9.99");
    expect(formatUsdDisplay(9.9)).toBe("$9.90");
  });

  it("strips existing USD prefix", () => {
    expect(formatUsdDisplay("USD 12.00")).toBe("$12.00");
  });
});

describe("formatBillingPeriod", () => {
  it("formats one-time purchase", () => {
    expect(formatBillingPeriod({ kind: "oneTime" }, "zh-CN")).toBe(
      "一次性购买",
    );
    expect(formatBillingPeriod({ kind: "oneTime" }, "en")).toBe(
      "AppPurchaseOneTime",
    );
  });

  it("formats subscription intervals", () => {
    expect(
      formatBillingPeriod(
        { kind: "subscription", interval: "EVERY_30_DAYS" },
        "zh-CN",
      ),
    ).toBe("月付");
    expect(
      formatBillingPeriod(
        { kind: "subscription", interval: "EVERY_30_DAYS" },
        "en",
      ),
    ).toBe("EVERY_30_DAYS");
    expect(
      formatBillingPeriod({ kind: "subscription", interval: "ANNUAL" }, "en"),
    ).toBe("ANNUAL");
    expect(
      formatBillingPeriod({ kind: "subscription", interval: "ANNUAL" }, "zh-CN"),
    ).toBe("年付");
  });
});

describe("formatPurchaseType and formatCreditReason", () => {
  it("localizes purchase type", () => {
    expect(formatPurchaseType("creditPack", "zh-CN")).toBe("积分购买");
    expect(formatPurchaseType("creditPack", "en")).toBe("Credit pack");
  });

  it("localizes credit reason keys", () => {
    expect(formatCreditReason("subscription_started", "zh-CN")).toBe(
      "订阅生效",
    );
    expect(formatCreditReason("subscription_started", "en")).toBe(
      "Subscription activated",
    );
    expect(formatCreditReason("credit_pack_purchased", "en")).toBe(
      "Credit pack purchased",
    );
  });
});

describe("resolveNotificationLocale", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("maps session locale", () => {
    expect(mapSessionLocaleToNotificationLocale("en")).toBe("en");
    expect(mapSessionLocaleToNotificationLocale("zh-CN")).toBe("zh-CN");
    expect(resolveNotificationLocale("en-US")).toBe("en");
  });

  it("falls back to env then zh-CN", () => {
    delete process.env.NOTIFICATION_DEFAULT_LOCALE;
    expect(resolveNotificationLocale(null)).toBe("zh-CN");

    process.env.NOTIFICATION_DEFAULT_LOCALE = "en";
    expect(resolveNotificationLocale(undefined)).toBe("en");
  });
});
