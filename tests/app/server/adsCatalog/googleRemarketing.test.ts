import { describe, expect, it } from "vitest";
import { generateGooglePurchaseCustomPixel } from "../../../../app/lib/googleCustomPixel";
import { GOOGLE_OFFER_ID_FIXTURES } from "../../../../app/lib/googleOfferId";
import {
  buildShopifyCustomerEventsUrl,
  GOOGLE_REMARKETING_DEFAULT_EVENTS,
  GOOGLE_REMARKETING_DEFAULT_FIELD_GROUPS,
  normalizeGoogleRemarketingEvents,
  normalizeGoogleRemarketingFieldGroups,
} from "../../../../app/lib/googleRemarketing";
import { parseGoogleAwCandidates } from "../../../../app/server/adsCatalog/googleRemarketing.server";

describe("Google AW 候选", () => {
  it("从全局标签和转化设置提取去重后的 AW ID", () => {
    const candidates = parseGoogleAwCandidates(
      [
        {
          customer: {
            descriptiveName: "Demo",
            remarketingSetting: {
              googleGlobalSiteTag:
                "<script>gtag('config', 'AW-123456789')</script>",
            },
            conversionTrackingSetting: {
              conversionTrackingId: "123456789",
              crossAccountConversionTrackingId: "987654321",
            },
          },
        },
      ],
      "1112223333",
    );

    expect(candidates.map((item) => item.tagId)).toEqual([
      "AW-123456789",
      "AW-987654321",
    ]);
    expect(candidates[1]?.crossAccount).toBe(true);
  });
});

describe("再营销默认配置", () => {
  it("缺省时回落到一键推荐事件与字段", () => {
    expect(normalizeGoogleRemarketingEvents(undefined)).toEqual(
      GOOGLE_REMARKETING_DEFAULT_EVENTS,
    );
    expect(normalizeGoogleRemarketingFieldGroups(undefined)).toEqual(
      GOOGLE_REMARKETING_DEFAULT_FIELD_GROUPS,
    );
  });

  it("构建客户事件设置页 deep link", () => {
    expect(buildShopifyCustomerEventsUrl("ciwishop.myshopify.com")).toBe(
      "https://admin.shopify.com/store/ciwishop/settings/customer_events",
    );
  });
});

describe("实验性 purchase Custom Pixel", () => {
  it("只订阅 checkout_completed 并包含去重与隐私门禁", () => {
    const script = generateGooglePurchaseCustomPixel({
      tagId: "AW-123456789",
      enabledFieldGroups: ["product", "transaction"],
    });

    expect(script).toContain("analytics.subscribe('checkout_completed'");
    expect(script).toContain("completedTransactions");
    expect(script).toContain("marketingAllowed");
    expect(script).not.toContain("checkout_started");
    for (const fixture of GOOGLE_OFFER_ID_FIXTURES) {
      expect(fixture.expected).toBeTruthy();
    }
  });
});
