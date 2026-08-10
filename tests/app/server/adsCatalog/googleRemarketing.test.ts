import { describe, expect, it } from "vitest";
import { generateGooglePurchaseCustomPixel } from "../../../../app/lib/googleCustomPixel";
import { GOOGLE_OFFER_ID_FIXTURES } from "../../../../app/lib/googleOfferId";
import {
  buildGoogleSendTo,
  buildShopifyCustomerEventsUrl,
  GOOGLE_REMARKETING_DEFAULT_EVENTS,
  GOOGLE_REMARKETING_DEFAULT_FIELD_GROUPS,
  normalizeGoogleConversionId,
  normalizeGoogleConversionLabel,
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
  it("订阅 checkout 漏斗事件并包含去重与隐私门禁", () => {
    const script = generateGooglePurchaseCustomPixel({
      tagId: "AW-123456789",
      enabledFieldGroups: ["product", "transaction"],
    });

    expect(script).toContain("analytics.subscribe('checkout_completed'");
    expect(script).toContain("analytics.subscribe('checkout_started'");
    expect(script).toContain("analytics.subscribe('payment_info_submitted'");
    expect(script).toContain("api.customerPrivacy.subscribe('visitorConsentCollected'");
    expect(script).not.toMatch(/(?<!api\.)customerPrivacy\.subscribe/);
    expect(script).toContain("completedTransactions");
    expect(script).toContain("checkoutStartedTokens");
    expect(script).toContain("paymentInfoTokens");
    expect(script).toContain("marketingAllowed");
    for (const fixture of GOOGLE_OFFER_ID_FIXTURES) {
      expect(fixture.expected).toBeTruthy();
    }
  });

  it("配置 Conversion Label 时追加 send_to 转化事件", () => {
    const script = generateGooglePurchaseCustomPixel({
      tagId: "AW-123456789",
      enabledFieldGroups: ["product", "transaction"],
      conversionLabel: "_fOHCM7Ax90cEL-69aJE",
    });
    expect(script).toContain("gtag('event', 'conversion'");
    expect(script).toContain(
      "SPARK_CONFIG.tagId + '/' + SPARK_CONFIG.conversionLabel",
    );
  });

  it("未配置 Conversion Label 时以运行时守卫禁用转化事件", () => {
    const script = generateGooglePurchaseCustomPixel({
      tagId: "AW-123456789",
      enabledFieldGroups: ["product"],
    });
    // 转化上报由 `if (SPARK_CONFIG.conversionLabel)` 守卫，label 为空时运行时不触发。
    expect(script).toContain('"conversionLabel":""');
    expect(script).toContain("if (SPARK_CONFIG.conversionLabel)");
  });

  it("启用 enhanced conversions 时注入 user_data", () => {
    const script = generateGooglePurchaseCustomPixel({
      tagId: "AW-123456789",
      enabledFieldGroups: ["product"],
      enhancedConversions: true,
    });
    expect(script).toContain("allow_enhanced_conversions:true");
    expect(script).toContain("gtag('set', 'user_data'");
  });
});

describe("Conversion ID / Label 归一化", () => {
  it("裸数字归一化为 AW- 前缀", () => {
    expect(normalizeGoogleConversionId("18326838591")).toBe("AW-18326838591");
  });

  it("AW-数字（大小写）统一大写保留", () => {
    expect(normalizeGoogleConversionId("aw-123")).toBe("AW-123");
    expect(normalizeGoogleConversionId(" AW-123 ")).toBe("AW-123");
  });

  it("非法输入返回 null", () => {
    expect(normalizeGoogleConversionId("abc")).toBeNull();
    expect(normalizeGoogleConversionId("")).toBeNull();
    expect(normalizeGoogleConversionId(undefined)).toBeNull();
  });

  it("Label 去除首尾空白", () => {
    expect(normalizeGoogleConversionLabel("  label  ")).toBe("label");
    expect(normalizeGoogleConversionLabel(undefined)).toBe("");
  });

  it("send_to：有 label 拼接，无 label 退回 tagId", () => {
    expect(buildGoogleSendTo("AW-123", "abc")).toBe("AW-123/abc");
    expect(buildGoogleSendTo("AW-123")).toBe("AW-123");
    expect(buildGoogleSendTo("AW-123", "  ")).toBe("AW-123");
  });
});
